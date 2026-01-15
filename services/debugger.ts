export type LogLevel = 'info' | 'warn' | 'error' | 'debug';

export interface LogEntry {
    id: number;
    timestamp: string;
    level: LogLevel;
    category: string;
    message: string;
    data?: any;
}

class ProjectDebugger {
    private logs: LogEntry[] = [];
    private listeners: ((entry: LogEntry) => void)[] = [];
    private idCounter = 0;
    public isEnabled = true;

    log(category: string, message: string, data?: any) {
        this.addEntry('info', category, message, data);
    }

    warn(category: string, message: string, data?: any) {
        this.addEntry('warn', category, message, data);
    }

    error(category: string, message: string, data?: any) {
        this.addEntry('error', category, message, data);
    }

    debug(category: string, message: string, data?: any) {
        if (process.env.NODE_ENV !== 'production') {
            this.addEntry('debug', category, message, data);
        }
    }

    private addEntry(level: LogLevel, category: string, message: string, data?: any) {
        if (!this.isEnabled) return;

        const entry: LogEntry = {
            id: ++this.idCounter,
            timestamp: new Date().toLocaleTimeString(),
            level,
            category,
            message,
            data
        };

        this.logs.push(entry);
        if (this.logs.length > 5000) this.logs.shift(); // Keep memory somewhat clean
        
        // Console echo
        const prefix = `[${category}]`;
        if (level === 'error') console.error(prefix, message, data);
        else if (level === 'warn') console.warn(prefix, message, data);
        else console.log(prefix, message, data || '');

        this.notifyListeners(entry);
    }

    subscribe(listener: (entry: LogEntry) => void) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    private notifyListeners(entry: LogEntry) {
        this.listeners.forEach(l => l(entry));
    }

    getLogs() {
        return this.logs;
    }

    clear() {
        this.logs = [];
        this.idCounter = 0;
    }
}

export const projectDebugger = new ProjectDebugger();
