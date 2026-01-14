
import React, { useState } from 'react';
import { Plus, Trash2, Box, Database, AlertCircle, Layers, RotateCcw } from 'lucide-react';
import { CargoItem } from '../types';
import { MOCK_CARGO_COLORS } from '../constants';

interface CargoFormProps {
  items: CargoItem[];
  onAdd: (item: CargoItem) => void;
  onRemove: (id: string) => void;
  onClear?: () => void;
  onLoadDemo?: () => void;
}

interface FormState {
    name: string;
    l: number | '';
    w: number | '';
    h: number | '';
    weight: number | '';
    qty: number | '';
    unstackable: boolean;
}

export const CargoForm: React.FC<CargoFormProps> = ({ items, onAdd, onRemove, onClear, onLoadDemo }) => {
  const [formData, setFormData] = useState<FormState>({
    name: '',
    l: 120,
    w: 80,
    h: 100,
    weight: '',
    qty: 1,
    unstackable: false
  });

  const [errors, setErrors] = useState<Record<string, boolean>>({});

  const handleInputChange = (field: keyof FormState, value: string | boolean) => {
      if (field === 'unstackable') {
          setFormData(prev => ({ ...prev, [field]: value as boolean }));
          return;
      }

      if (field === 'name') {
          setFormData(prev => ({ ...prev, [field]: value as string }));
          return;
      }

      // Handle numbers
      if (value === '') {
          setFormData(prev => ({ ...prev, [field]: '' }));
      } else {
          setFormData(prev => ({ ...prev, [field]: parseFloat(value as string) }));
      }
      
      // Clear error for this field if it exists
      if (errors[field]) {
          setErrors(prev => ({ ...prev, [field]: false }));
      }
  };

  const handleAdd = () => {
    const newErrors: Record<string, boolean> = {};
    if (!formData.l) newErrors.l = true;
    if (!formData.w) newErrors.w = true;
    if (!formData.h) newErrors.h = true;
    if (!formData.qty) newErrors.qty = true;

    if (Object.keys(newErrors).length > 0) {
        setErrors(newErrors);
        return;
    }

    const finalName = formData.name.trim() || `Item ${items.length + 1}`;
    const finalWeight = formData.weight === '' ? 500 : (formData.weight as number);
    
    const item: CargoItem = {
      id: Math.random().toString(36).substr(2, 9),
      name: finalName,
      dimensions: { 
          length: formData.l as number, 
          width: formData.w as number, 
          height: formData.h as number 
      },
      weight: finalWeight,
      quantity: formData.qty as number,
      color: MOCK_CARGO_COLORS[items.length % MOCK_CARGO_COLORS.length],
      unstackable: formData.unstackable
    };
    
    onAdd(item);
    
    // Reset form
    setFormData({ 
        name: '', 
        l: 120, 
        w: 80, 
        h: 100, 
        weight: '', 
        qty: 1,
        unstackable: false
    });
    setErrors({});
  };

  return (
    <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold text-gray-800 flex items-center">
            <Box className="w-5 h-5 mr-2 text-indigo-600" /> Cargo Manifest
        </h3>
        <div className="flex items-center gap-2">
            {items.length > 0 && onClear && (
                <button 
                    onClick={onClear}
                    title="Clear All"
                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-all"
                >
                    <RotateCcw className="w-4 h-4" />
                </button>
            )}
            {onLoadDemo && items.length === 0 && (
                <button 
                    onClick={onLoadDemo}
                    className="text-xs bg-indigo-50 hover:bg-indigo-100 text-indigo-600 px-2.5 py-1.5 rounded-md flex items-center gap-1.5 transition-colors font-medium"
                >
                    <Database className="w-3.5 h-3.5" /> Demo
                </button>
            )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="col-span-2">
            <label className="text-xs font-medium text-gray-500">Name <span className="text-gray-300 font-normal">(Optional)</span></label>
            <input 
                type="text" 
                className="w-full p-2 border rounded-md text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                placeholder="e.g. Pallet A"
                value={formData.name}
                onChange={e => handleInputChange('name', e.target.value)}
            />
        </div>
        <div>
            <label className={`text-xs font-medium ${errors.l ? 'text-red-500' : 'text-gray-500'}`}>Length (cm)*</label>
            <input 
                type="number" 
                className={`w-full p-2 border rounded-md text-sm ${errors.l ? 'border-red-500 bg-red-50' : ''}`}
                value={formData.l} 
                onChange={e => handleInputChange('l', e.target.value)} 
            />
        </div>
        <div>
            <label className={`text-xs font-medium ${errors.w ? 'text-red-500' : 'text-gray-500'}`}>Width (cm)*</label>
            <input 
                type="number" 
                className={`w-full p-2 border rounded-md text-sm ${errors.w ? 'border-red-500 bg-red-50' : ''}`}
                value={formData.w} 
                onChange={e => handleInputChange('w', e.target.value)} 
            />
        </div>
        <div>
            <label className={`text-xs font-medium ${errors.h ? 'text-red-500' : 'text-gray-500'}`}>Height (cm)*</label>
            <input 
                type="number" 
                className={`w-full p-2 border rounded-md text-sm ${errors.h ? 'border-red-500 bg-red-50' : ''}`}
                value={formData.h} 
                onChange={e => handleInputChange('h', e.target.value)} 
            />
        </div>
        <div>
            <label className="text-xs font-medium text-gray-500">Weight (kg)</label>
            <input 
                type="number" 
                className="w-full p-2 border rounded-md text-sm"
                placeholder="Def: 500"
                value={formData.weight} 
                onChange={e => handleInputChange('weight', e.target.value)} 
            />
        </div>
        <div className="col-span-2 flex flex-col gap-2">
            <label className="flex items-center gap-2 cursor-pointer group">
                <input 
                    type="checkbox" 
                    className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                    checked={formData.unstackable}
                    onChange={e => handleInputChange('unstackable', e.target.checked)}
                />
                <div className="flex flex-col">
                    <span className="text-sm text-gray-700 font-medium group-hover:text-indigo-700">Unstackable</span>
                    <span className="text-[10px] text-gray-400">Items cannot be placed on top of this.</span>
                </div>
            </label>
        </div>
        <div className="col-span-2">
            <label className={`text-xs font-medium ${errors.qty ? 'text-red-500' : 'text-gray-500'}`}>Quantity*</label>
            <div className="flex gap-2">
                <input 
                    type="number" 
                    className={`w-full p-2 border rounded-md text-sm ${errors.qty ? 'border-red-500 bg-red-50' : ''}`}
                    value={formData.qty} 
                    onChange={e => handleInputChange('qty', e.target.value)} 
                />
                <button 
                    onClick={handleAdd}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md flex items-center justify-center transition-colors shadow-sm"
                >
                    <Plus className="w-5 h-5" />
                </button>
            </div>
        </div>
      </div>

      <div className="max-h-[300px] overflow-y-auto space-y-2">
        {items.map(item => (
            <div key={item.id} className="flex items-center justify-between p-2 bg-gray-50 rounded-md border border-gray-100 text-sm">
                <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: item.color }}></div>
                    <div className="min-w-0">
                        <p className="font-medium text-gray-700 truncate">{item.name}</p>
                        <p className="text-xs text-gray-500">
                            {item.dimensions.length}x{item.dimensions.width}x{item.dimensions.height} | {item.weight}kg | x{item.quantity}
                        </p>
                        {item.unstackable && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded mt-0.5 border border-amber-200">
                                <Layers className="w-3 h-3" /> Unstackable
                            </span>
                        )}
                    </div>
                </div>
                <button onClick={() => onRemove(item.id)} className="text-red-400 hover:text-red-600 p-1">
                    <Trash2 className="w-4 h-4" />
                </button>
            </div>
        ))}
        {items.length === 0 && (
            <div className="text-center py-6 border-2 border-dashed border-gray-200 rounded-lg">
                <AlertCircle className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                <p className="text-xs text-gray-400">Cargo manifest is empty.</p>
            </div>
        )}
      </div>
    </div>
  );
};
