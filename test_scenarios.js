const db = require('./backend/config/db');
console.log('Testing Scenario 1...');
db.exec('INSERT INTO inventory_items (id, name, stock, unit, unit_price, branch_id) VALUES (''test1'', ''Test 1'', 10, ''Units'', 50.0, ''br1'')');
const item1_before = db.prepare('SELECT unit_price FROM inventory_items WHERE id = ''test1''').get();
const updateSql1 = 'UPDATE inventory_items SET stock = stock + ? WHERE id = ?';
db.prepare(updateSql1).run(5, 'test1');
const item1_after = db.prepare('SELECT unit_price FROM inventory_items WHERE id = ''test1''').get();
console.log('Scenario 1 - Before:', item1_before.unit_price, 'After:', item1_after.unit_price);

console.log('\nTesting Scenario 2...');
db.exec('INSERT INTO inventory_items (id, name, stock, unit, unit_price, branch_id) VALUES (''test2'', ''Test 2'', 0, ''Units'', 0.0, ''br1'')');
let updateSql2 = 'UPDATE inventory_items SET stock = stock + ?';
let params2 = [10];
const tp2 = 500;
const currentStock2 = 0;
const currentUnitPrice2 = 0;
const newStock2 = currentStock2 + 10;
const newUnitPrice2 = ((currentStock2 * currentUnitPrice2) + tp2) / newStock2;
updateSql2 += ', unit_price = ?';
params2.push(Number(newUnitPrice2.toFixed(2)));
updateSql2 += ' WHERE id = ?';
params2.push('test2');
db.prepare(updateSql2).run(...params2);
const item2_after = db.prepare('SELECT unit_price FROM inventory_items WHERE id = ''test2''').get();
console.log('Scenario 2 - Calculated Unit Price:', item2_after.unit_price);

db.exec('DELETE FROM inventory_items WHERE id IN (''test1'', ''test2'')');
console.log('Cleanup complete.');

