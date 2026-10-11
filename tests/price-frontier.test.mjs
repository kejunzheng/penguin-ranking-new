import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {blendedPrice,frontierOf} from '../src/price-frontier-math.js';

test('blended price uses cache:input:output = 7:2:1 and falls back to input when no cache price',()=>{
 const blend={cache:7,input:2,output:1};
 assert.equal(blendedPrice({cache:0.5,input:5,output:25},blend,1),(3.5+10+25)/10);
 assert.equal(blendedPrice({cache:null,input:1,output:2},blend,2),(7+2+2)/10*2);
});

test('frontier keeps only models that set a new high score as price rises',()=>{
 const line=frontierOf([{id:'a',price:1,score:40},{id:'b',price:2,score:38},{id:'c',price:3,score:45},{id:'d',price:3,score:41},{id:'e',price:0.5,score:30}]);
 assert.deepEqual(line.map(point=>point.id),['e','a','c']);
});

test('bundled data carries AA price points for tracked models only',()=>{
 const data=JSON.parse(fs.readFileSync('public/data/benchmarks.json','utf8'));
 const frontier=data.price_frontier;
 assert.ok(frontier&&frontier.points.length>=30,'enough priced models');
 assert.ok(frontier.usd_to_cny>5&&frontier.usd_to_cny<9);
 const ids=new Set(data.models.map(model=>model.id));
 assert.ok(frontier.points.every(point=>ids.has(point.id)&&Number.isFinite(point.score)&&point.input>=0&&point.output>=0));
 assert.equal(new Set(frontier.points.map(point=>point.id)).size,frontier.points.length,'one point per model');
});
