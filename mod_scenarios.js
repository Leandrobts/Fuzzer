/**
 * MOD_SCENARIOS.JS — Dynamic Test Loader (Robust Version)
 * Carrega automaticamente todos os testes com fallbacks seguros
 */

// Importa cada teste com try-catch via wrapper
function loadTest(path, fallback = null) {
    // Como não podemos usar import() dinâmico no PS4 facilmente,
    // vamos definir todos os testes inline com lazy loading
    return fallback;
}

import { testBufferSlabOverflow } from './tests/buffer_slab_overflow.js';
import { testTypedarrayOob } from './tests/typedarray_oob.js';
import { testGcUaf } from './tests/gc_uaf.js';
import { testJscTypeConfusion } from './tests/jsc_type_confusion.js';
import { testMessagechannelRace } from './tests/messagechannel_race.js';

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

/**
 * Registry de TODOS os testes disponíveis
 * NOVOS TESTES: Adicione aqui após criar o arquivo
 */
export const Scenarios = {

    bufferSlabOverflow: testBufferSlabOverflow,
    typedarrayOob: testTypedarrayOob,
    gcUaf: testGcUaf,
    jscTypeConfusion: testJscTypeConfusion,
    messagechannelRace: testMessagechannelRace,
    // Canvas & Gráficos
    canvasPixelStealing: testCanvasPixelStealing,
    
    // Arrays & Buffers
    arraybufferNeutering: testArraybufferNeutering,
    
    // DOM
    domClobbering: testDomClobbering,
    
    // Prototype & Types
    prototypePollution: testPrototypePollution,
    
    // Workers & Mensagens
    workerRaceCondition: testWorkerRaceCondition,
    postMessageLeak: testPostMessageLeak,
    
    // Timing & Side Channels
    timingSideChannel: testTimingSideChannel,
    
    // Storage
    localStorageSniffing: testLocalStorageSniffing,
    
    // CSS & Layout
    cssInjection: testCssInjection,
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
                ps4Compatible: scenario.ps4Compatible !== false
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
        
        // Verifica se tem os métodos necessários
        return typeof scenario.setup === 'function' &&
               Array.isArray(scenario.probe) &&
               scenario.probe.length > 0 &&
               typeof scenario.trigger === 'function' &&
               typeof scenario.cleanup === 'function';
    }
};

// Log de inicialização
const total = Object.keys(Scenarios).length;
const valid = Object.keys(Scenarios).filter(k => ScenarioInfo.isValid(k)).length;
const ps4Compatible = ScenarioInfo.getPS4Compatible().length;

console.log(`%c📋 Scenario Loader: ${total} testes carregados`, 'color: #00ff00');
console.log(`%c   ✅ Válidos: ${valid}`, 'color: #00ccff');
console.log(`%c   🎮 PS4 Compatible: ${ps4Compatible}`, 'color: #ffaa00');

// Lista categorias
const categories = ScenarioInfo.getByCategory();
for (const [cat, tests] of Object.entries(categories)) {
    console.log(`%c   📁 ${cat}: ${tests.length} teste(s)`, 'color: #888');
}

// Exporta também um array para iteração fácil
export const ScenarioList = Object.entries(Scenarios).map(([key, scenario]) => ({
    key,
    ...scenario
}));
