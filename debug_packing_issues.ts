
import { calculateShipmentAsync } from './services/packer';
import { CargoItem } from './types';

const items: CargoItem[] = [
    { id: '1', "name": "Connector Male", "quantity": 334, dimensions: { length: 60, width: 46, height: 20 }, "weight": 16.17, "unstackable": false, color: 'blue' },
    { id: '2', "name": "Connector Female", "quantity": 334, dimensions: { length: 63, width: 63, height: 25 }, "weight": 20.66, "unstackable": false, color: 'orange' },
    { id: '3', "name": "Terminal Male", "quantity": 50, dimensions: { length: 63, width: 63, height: 25 }, "weight": 23.91, "unstackable": true, color: 'red' },
    { id: '4', "name": "Terminal Female", "quantity": 50, dimensions: { length: 63, width: 63, height: 25 }, "weight": 20.37, "unstackable": true, color: 'pink' },
    { id: '5', "name": "Cable Tie for use with wires&cables", "quantity": 168, dimensions: { length: 60, width: 46, height: 20 }, "weight": 8.4, "unstackable": true, color: 'green' },
    { id: '6', "name": "Solar Panel Connector Cap", "quantity": 157, dimensions: { length: 60, width: 46, height: 20 }, "weight": 6.5, "unstackable": true, color: 'yellow' },
    { id: '7', "name": "Copper profile", "quantity": 300, dimensions: { length: 38, width: 27, height: 17 }, "weight": 15.95, "unstackable": true, color: 'grey' }
];

console.log('Running debug packer with provided items...');

// Run async function
(async () => {
    try {
        const result = await calculateShipmentAsync('SMART_MIX', items, (msg) => console.log(msg));

        console.log('Packing Result Summary:');
        console.log(`Total Containers: ${result.length}`);
        result.forEach((c, i) => {
            console.log(`Container ${i + 1}: ${c.containerType} - Utilization: Volume ${c.volumeUtilization.toFixed(2)}%, Weight ${c.weightUtilization.toFixed(2)}%`);
            // detailed box counts
            const boxCounts: Record<string, number> = {};
            c.placedItems.forEach(b => {
                boxCounts[b.name] = (boxCounts[b.name] || 0) + 1;
            });
            console.log('  Contents:', boxCounts);
        });

        // Check for unpacked items
        if (result.length > 0 && result[result.length - 1].unplacedItems && result[result.length - 1].unplacedItems.length > 0) {
            console.log('\nUnpacked Items:');
            result[result.length - 1].unplacedItems.forEach(u => {
                console.log(`  ${u.name}: ${u.quantity}`);
            });
        }
    } catch (e) {
        console.error(e);
    }
})();
