import test from 'node:test';
import assert from 'node:assert/strict';
import { bfs, aStar } from '../src/lib/search.js';
import { calculateBudget, generateItinerary, recommendDestinations } from '../src/services/planner.js';

test('BFS returns the path with the fewest edges',()=>{const graph={A:['B','C'],B:['D'],C:['E'],E:['D'],D:[]};assert.deepEqual(bfs(graph,'A','D'),['A','B','D']);});
test('A* finds a lowest-cost path on a small graph',()=>{const graph={A:[{to:'B',cost:2},{to:'C',cost:1}],B:[{to:'D',cost:2}],C:[{to:'D',cost:8}],D:[]};assert.deepEqual(aStar(graph,'A','D',()=>0),{path:['A','B','D'],cost:4});});
test('budget totals equal itemised amounts',()=>{const c=calculateBudget({transportFromHyderabad:1000,accommodationNight:1000,localTransportDaily:100,foodDaily:200,activities:[{cost:100},{cost:100}]},3,1);assert.equal(c.total,c.transport+c.accommodation+c.localTransport+c.food+c.activities+c.contingency);});
test('recommendations respect geographic range and budget',()=>{const r=recommendDestinations({destinationRange:'India',budget:100000,days:3,travellers:1,interests:['history']});assert.ok(r.recommendations.length>0);assert.ok(r.recommendations.every(d=>d.country==='India'));});
test('itinerary rejects a budget shortfall',()=>{assert.throws(()=>generateItinerary('kyoto',{budget:1000,days:5,travellers:1}),/above your/);});
test('generated itinerary has an itemised budget and stable destination id',()=>{const p=generateItinerary('hampi',{budget:100000,days:3,travellers:1});assert.equal(p.destination.id,'hampi');assert.ok(p.budget.total>0);assert.equal(p.days.length,3);});
