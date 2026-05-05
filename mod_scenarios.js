/**
 * MOD_SCENARIOS.JS — Dynamic Test Loader
 * Carrega automaticamente todos os testes da pasta /tests/
 */

import { testCanvasPixelStealing } from './tests/canvas_pixel_stealing.js';
import { testArraybufferNeutering } from './tests/arraybuffer_neutering.js';
import { testDomClobbering } from './tests/dom_clobbering.js';
import { testPrototypePollution } from './tests/prototype_pollution.js';
import { testWorkerRaceCondition } from './tests/worker_race_condition.js';
import { testTimingSideChannel } from './tests/timing_side_channel.js';
import { testPostMessageLeak } from './tests/postmessage_leak.js';
import { testLocalStorageSniffing } from './tests/localstorage_sniffing.js';
import { testCssInjection } from './tests/css_injection.js';

/**
 * Registry de todos os testes disponíveis
 * ADICIONE NOVOS TESTES AQUI:
 * 1. Crie arquivo em /tests/
 * 2. Importe acima
 * 3. Adicione ao objeto abaixo
 */
export const Scenarios = {
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
                name: scenario.name,
                risk: scenario.risk,
                description: scenario.description,
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
    }
};

console.log(`📋 Scenario Loader: ${ScenarioInfo.total} testes carregados`);
console.log(`🎮 PS4 Compatible: ${ScenarioInfo.getPS4Compatible().length} testes`);
