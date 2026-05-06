/**
 * MOD_SCENARIOS.JS — Dynamic Test Loader (ATUALIZADO)
 * 15 testes carregados (incluindo PoC da vulnerabilidade confirmada)
 */
import { testDataviewOobPrecise } from './tests/dataview_oob_precise.js';
import { testSpliceSliceNegative } from './tests/splice_slice_negative.js';
import { testArrayPrototypeOverride } from './tests/array_prototype_override.js';
// Testes Canvas
import { testCanvasPixelStealing } from './tests/canvas_pixel_stealing.js';

// Testes ArrayBuffer
import { testArraybufferNeutering } from './tests/arraybuffer_neutering.js';

// Testes DOM
import { testDomClobbering } from './tests/dom_clobbering.js';

// Testes Prototype
import { testPrototypePollution } from './tests/prototype_pollution.js';

// Testes Worker
import { testWorkerRaceCondition } from './tests/worker_race_condition.js';

// Testes Timing
import { testTimingSideChannel } from './tests/timing_side_channel.js';

// Testes PostMessage
import { testPostMessageLeak } from './tests/postmessage_leak.js';

// Testes Storage
import { testLocalStorageSniffing } from './tests/localstorage_sniffing.js';

// Testes CSS
import { testCssInjection } from './tests/css_injection.js';

// Testes Avançados (NOVOS)
import { testBufferSlabOverflow } from './tests/buffer_slab_overflow.js';
import { testTypedarrayOob } from './tests/typedarray_oob.js';
import { testGcUaf } from './tests/gc_uaf.js';
import { testJscTypeConfusion } from './tests/jsc_type_confusion.js';
import { testMessagechannelRace } from './tests/messagechannel_race.js';

// ⚠️ PoC da Vulnerabilidade Confirmada
import { testTypedarrayLengthCorruptionPoc } from './tests/typedarray_length_corruption_poc.js';

/**
 * Registry de TODOS os testes disponíveis
 * TOTAL: 15 testes
 */
export const Scenarios = {
    // ==========================================
    // Canvas & Gráficos (1)
    // ==========================================
    canvasPixelStealing: testCanvasPixelStealing,
    
    // ==========================================
    // Arrays, Buffers & Tipos (4)
    // ==========================================
    arraybufferNeutering: testArraybufferNeutering,
    bufferSlabOverflow: testBufferSlabOverflow,
    typedarrayOob: testTypedarrayOob,
    typedarrayLengthCorruptionPoc: testTypedarrayLengthCorruptionPoc, // ⚠️ PoC
    
    // ==========================================
    // DOM & CSS (2)
    // ==========================================
    domClobbering: testDomClobbering,
    cssInjection: testCssInjection,
    
    // ==========================================
    // Prototype & JIT (2)
    // ==========================================
    prototypePollution: testPrototypePollution,
    jscTypeConfusion: testJscTypeConfusion,
    
    // ==========================================
    // Workers & Mensagens (3)
    // ==========================================
    workerRaceCondition: testWorkerRaceCondition,
    postMessageLeak: testPostMessageLeak,
    messagechannelRace: testMessagechannelRace,
    
    // ==========================================
    // GC & Memory (1)
    // ==========================================
    gcUaf: testGcUaf,
    
    // ==========================================
    // Timing & Side Channels (1)
    // ==========================================
    timingSideChannel: testTimingSideChannel,
    
    // ==========================================
    // Storage (1)
    // ==========================================
    localStorageSniffing: testLocalStorageSniffing,
    dataviewOobPrecise: testDataviewOobPrecise,
    spliceSliceNegative: testSpliceSliceNegative,
    arrayPrototypeOverride: testArrayPrototypeOverride,
};

/**
 * Informações agregadas de todos os cenários
 */
export const ScenarioInfo = {
    /**
     * Lista todos os cenários por categoria
     */
    getByCategory: function() {
        const categories = {};
        
        for (const [key, scenario] of Object.entries(Scenarios)) {
            const cat = scenario.category || 'UNKNOWN';
            if (!categories[cat]) {
                categories[cat] = [];
            }
            categories[cat].push({
                key: key,
                id: scenario.id,
                name: scenario.name || scenario.id,
                risk: scenario.risk,
                description: scenario.description || '',
                ps4Compatible: scenario.ps4Compatible !== false,
                isPoc: scenario.id?.includes('POC') || false
            });
        }
        
        return categories;
    },
    
    /**
     * Retorna cenários compatíveis com PS4
     */
    getPS4Compatible: function() {
        const compatible = [];
        for (const [key, scenario] of Object.entries(Scenarios)) {
            if (scenario.ps4Compatible !== false) {
                compatible.push(key);
            }
        }
        return compatible;
    },
    
    /**
     * Retorna cenários por nível de risco
     */
    getByRisk: function(risk) {
        const filtered = [];
        for (const [key, scenario] of Object.entries(Scenarios)) {
            if (scenario.risk === risk) {
                filtered.push(key);
            }
        }
        return filtered;
    },
    
    /**
     * Retorna apenas PoCs (provas de conceito)
     */
    getPocs: function() {
        const pocs = [];
        for (const [key, scenario] of Object.entries(Scenarios)) {
            if (scenario.id?.includes('POC')) {
                pocs.push(key);
            }
        }
        return pocs;
    },
    
    /**
     * Total de cenários disponíveis
     */
    get total() {
        return Object.keys(Scenarios).length;
    },
    
    /**
     * Valida se um cenário é executável
     */
    isValid: function(key) {
        const scenario = Scenarios[key];
        if (!scenario) return false;
        
        return typeof scenario.setup === 'function' &&
               Array.isArray(scenario.probe) &&
               scenario.probe.length > 0 &&
               typeof scenario.trigger === 'function' &&
               typeof scenario.cleanup === 'function';
    },
    
    /**
     * Retorna resumo por risco
     */
    getRiskSummary: function() {
        const summary = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0 };
        for (const scenario of Object.values(Scenarios)) {
            if (summary[scenario.risk] !== undefined) {
                summary[scenario.risk]++;
            }
        }
        return summary;
    }
};

// ==========================================
// Log de inicialização
// ==========================================
const total = ScenarioInfo.total;
const valid = Object.keys(Scenarios).filter(k => ScenarioInfo.isValid(k)).length;
const ps4Compatible = ScenarioInfo.getPS4Compatible().length;
const pocs = ScenarioInfo.getPocs();
const riskSummary = ScenarioInfo.getRiskSummary();

console.log(`%c📋 Scenario Loader: ${total} testes carregados`, 'color: #00ff00; font-weight: bold;');
console.log(`%c   ✅ Válidos: ${valid}`, 'color: #00ccff');
console.log(`%c   🎮 PS4 Compatible: ${ps4Compatible}`, 'color: #ffaa00');
console.log(`%c   ⚡ CRITICAL: ${riskSummary.CRITICAL} | 🔴 HIGH: ${riskSummary.HIGH} | 🟡 MEDIUM: ${riskSummary.MEDIUM} | ⚪ LOW: ${riskSummary.LOW}`, 'color: #888');

if (pocs.length > 0) {
    console.log(`%c   🏆 PoCs carregados: ${pocs.join(', ')}`, 'color: #ff4444; font-weight: bold;');
}

// Lista categorias
const categories = ScenarioInfo.getByCategory();
for (const [cat, tests] of Object.entries(categories)) {
    const names = tests.map(t => t.isPoc ? `⚠️${t.name}` : t.name).join(', ');
    console.log(`%c   📁 ${cat}: ${names}`, 'color: #555; font-size: 10px;');
}

// ==========================================
// Exporta também como array para iteração
// ==========================================
export const ScenarioList = Object.entries(Scenarios).map(([key, scenario]) => ({
    key,
    ...scenario
}));
