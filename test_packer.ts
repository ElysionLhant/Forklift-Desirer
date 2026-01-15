
process.env.NODE_ENV = 'development'; // Enable debug logs

import { calculateShipmentAsync } from './services/packer';
import { CargoItem } from './types';
import { projectDebugger } from './services/debugger';

// Setup Mock Data
// Scenario: 40HQ Container (approx 1203 x 235 x 269)
// Stackable Item (Blue): 120 x 100 x 100. Two can stack (200cm), leaving 69cm gap.
// Unstackable Item (Red): 100 x 100 x 60. Fits in the 69cm gap (gap 9cm).

const cargoItems: CargoItem[] = [
    { 
        id: 'stackable-blue', 
        name: 'Stackable Blue', 
        dimensions: { length: 120, width: 100, height: 100 }, 
        weight: 100, 
        quantity: 20, 
        color: 'blue',
        unstackable: false
    },
    { 
        id: 'unstackable-red', 
        name: 'Unstackable Red', 
        dimensions: { length: 120, width: 100, height: 60 }, 
        weight: 50, 
        quantity: 5, 
        color: 'red',
        unstackable: true 
    }
];

const run = async () => {
    console.log("Starting Packer Test...");
    
    // Subscribe to logs to print them
    projectDebugger.subscribe(entry => {
        const time = entry.timestamp;
        const cat = entry.category;
        const msg = entry.message;
        const data = entry.data ? JSON.stringify(entry.data) : '';
        console.log(`[${time}] [${cat}] ${msg} ${data}`);
    });

    const results = await calculateShipmentAsync('SMART_MIX', cargoItems, (msg) => {});

    console.log(`\nPacking Complete. Containers Used: ${results.length}`);
    results.forEach((res, idx) => {
        console.log(`\nContainer #${idx + 1} (${res.containerType}):`);
        console.log(`Items: ${res.placedItems.length}`);
        console.log(`Utilization: ${res.volumeUtilization.toFixed(2)}%`);
        
        // Check Z/Y positions of Red Items
        const reds = res.placedItems.filter(i => i.unstackable);
        console.log(`Unstackable Items (Red) Report:`);
        reds.forEach(r => {
            console.log(` - ${r.name}: Pos(${r.position.x}, ${r.position.y}, ${r.position.z}) Dim(${r.dimensions.length}x${r.dimensions.width}x${r.dimensions.height})`);
        });

        const blues = res.placedItems.filter(i => !i.unstackable);
        console.log(`Stackable Items (Blue) Sample:`);
        blues.slice(0, 5).forEach(b => {
            console.log(` - ${b.name}: Pos(${b.position.x}, ${b.position.y}, ${b.position.z})`);
        });
    });
};

run();
