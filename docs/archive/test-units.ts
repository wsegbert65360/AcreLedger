import { calculateTotalAmount } from './src/utils/unitConversion';

function test(description: string, result: any, expected: any) {
  const passed = JSON.stringify(result) === JSON.stringify(expected);
  console.log(`${passed ? '✅' : '❌'} ${description}`);
  if (!passed) {
    console.log(`   Expected: ${JSON.stringify(expected)}`);
    console.log(`   Received: ${JSON.stringify(result)}`);
  }
}

console.log('Testing Spray Unit Conversions...\n');

// Liquid Tests
test('1.5 qt/ac on 100 acres -> 37.5 gal', calculateTotalAmount(1.5, 100, 'qt/ac'), { value: 37.5, unit: 'gal' });
test('20 fl oz/ac on 10 acres -> 200 fl oz (1.56 gal)', calculateTotalAmount(20, 10, 'fl oz/ac'), { value: 1.56, unit: 'gal' });
test('10 fl oz/ac on 2 acres -> 20 fl oz (Wait, 20 oz = 1.25 pt)', calculateTotalAmount(10, 2, 'fl oz/ac'), { value: 1.25, unit: 'pt' });
test('40 fl oz/ac on 1 acre -> 1.25 qt', calculateTotalAmount(40, 1, 'fl oz/ac'), { value: 1.25, unit: 'qt' });
test('3 pt/ac on 10 acres -> 30 pt (3.75 gal)', calculateTotalAmount(3, 10, 'pt/ac'), { value: 3.75, unit: 'gal' });
test('1.5 pt/ac on 2 acres -> 3 pt (1.5 qt)', calculateTotalAmount(1.5, 2, 'pt/ac'), { value: 1.5, unit: 'qt' });

// Dry Tests
test('1.5 lb/ac on 100 acres -> 150 lb', calculateTotalAmount(1.5, 100, 'lb/ac'), { value: 150, unit: 'lb' });
test('10 oz/ac on 1.6 acres -> 1 lb', calculateTotalAmount(10, 1.6, 'oz/ac'), { value: 1, unit: 'lb' });
test('5 oz/ac on 1 acre -> 5 oz', calculateTotalAmount(5, 1, 'oz/ac'), { value: 5, unit: 'oz' });

console.log('\nTests completed.');
