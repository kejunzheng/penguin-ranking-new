import test from 'node:test';
import assert from 'node:assert/strict';
import {dollars,parseOpenAI,parseAnthropic,parseGoogle,parseArcee,parseUpstage,scheduledDollars} from '../scripts/lib/global-price-sources.mjs';
import {priceHistory} from '../src/price-details.js';
test('absent token charges do not become free',()=>{assert.equal(dollars('Not available'),null);assert.equal(dollars('—'),null);assert.equal(dollars('Free'),0);assert.equal(dollars('$0.00'),0)});
test('standard prices exclude batch, cached, training and hosted models',()=>{
 const header='| Model | Short context input | Short context cached input | Short context cache writes | Short context output | Long context input |\n| --- | --- | --- | --- | --- | --- |\n';
 const source='### Standard pricing data\n'+header+'| sample | $2 | $0.20 | $2.50 | $10 | $4 |\n\n### Batch pricing data\n'+header+'| sample | $1 | $0.10 | $1.25 | $5 | $2 |\n';
 const rows=parseOpenAI(source);assert.equal(rows.length,1);assert.equal(rows[0].input,2);assert.equal(rows[0].output,10);
 assert.equal(parseArcee('| Model Name | Input | Output |\n| --- | --- | --- |\n| deepseek/model | $1 | $2 |\n| trinity-example | $0.25 | $0.8 |\n').length,1);
});
test('retired first-party models and long-context duplicate do not replace base rates',()=>{
 const table='| Model | Base input tokens | 5m cache writes | 1h cache writes | Cache hits | Output tokens |\n| --- | --- | --- | --- | --- | --- |\n| Claude Example (for prompts up to 100,000 tokens) | $0.1 | $1 | $1 | $1 | $0.5 |\n| Claude Example (for prompts over 100,000 tokens) | $0.5 | $1 | $1 | $1 | $2.5 |\n| Claude Old (retired) | $1 | $1 | $1 | $1 | $5 |\n';
 const rows=parseAnthropic(table);assert.equal(rows.length,1);assert.equal(rows[0].input,.1);
});
test('Google selects paid standard text prices and applies scheduled increases',()=>{
 const section='<h2>Gemini example</h2><code>gemini-example</code><h3>Standard</h3><table><tr><th></th><th>Free Tier</th><th>Paid Tier, per 1M tokens in USD</th></tr><tr><td>Input price</td><td>Free</td><td>$0.75 through December 31, 2026. $1.50 starting January 1, 2027.</td></tr><tr><td>Output price</td><td>Free</td><td>$3.75</td></tr></table>';
 assert.equal(parseGoogle(section,new Date('2026-10-08'))[0].input,.75);
 assert.equal(scheduledDollars('$0.75 through December 31, 2026. $1.50 starting January 1, 2027.',new Date('2027-01-01')),1.5);
});
test('Upstage promotion uses the effective time window instead of hidden base price',()=>{
 const page='<div class="pricing-card-v2"><a href="https://console.upstage.ai/docs/models/solar-pro-4"><h4>Solar Pro 4</h4></a><div data-rate="input">0.30</div><div data-rate="output">1.2</div><div data-promo="schedule">2026-09-11T00:00:00Z|2026-10-11T00:00:00Z|input=0.09|output=0.36\n2026-10-11T00:00:00Z||input=0.15|output=0.6</div></div>';
 assert.equal(parseUpstage(page,new Date('2026-10-08'))[0].input,.09);assert.equal(parseUpstage(page,new Date('2026-10-11'))[0].output,.6);
});
test('USD native history is not divided by the exchange rate again',()=>{
 const m={latest:{date:'2026-10-08'},history_currency:'USD',history:[['2026-10-08',2,10]]};assert.equal(priceHistory(m,'USD',7)[0].input,2);assert.equal(priceHistory(m,'CNY',7)[0].output,70);
});
