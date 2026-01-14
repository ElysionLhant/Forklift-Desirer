
import { calculateShipment } from './services/packer';
import { CargoItem } from './types';

// Mock data
const cargoItems: CargoItem[] = [
    // Two large blue boxes
    { 
        id: 'blue1', name: 'Blue Box 1', 
        dimensions: { length: 500, width: 100, height: 100 }, 
        weight: 100, quantity: 1, color: 'blue' 
    },
    { 
        id: 'blue2', name: 'Blue Box 2', 
        dimensions: { length: 500, width: 100, height: 100 }, 
        weight: 100, quantity: 1, color: 'blue' 
    },
    // One red box
    { 
        id: 'red1', name: 'Red Box', 
        dimensions: { length: 100, width: 80, height: 80 }, 
        weight: 50, quantity: 1, color: 'red' 
    }
];

const result = calculateShipment('SMART_MIX', cargoItems);

const container = result[0];
console.log(`Utilization: ${container.volumeUtilization}%`);
container.placedItems.forEach(item => {
    console.log(`Item ${item.name}: Pos [${item.position.x}, ${item.position.y}, ${item.position.z}], Dim [${item.dimensions.length}, ${item.dimensions.width}, ${item.dimensions.height}]`);
});
