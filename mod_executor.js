/**
 * MOD_EXECUTOR.JS — Core Execution Engine (Versão 13.0 - Sniper)
 * CORRIGIDO: Importa GCOracle de mod_gc.js
 */

import { GC, GCOracle } from './mod_gc.js';  // ⚠️ CORREÇÃO AQUI
import { Mutator } from './mod_mutator.js';
import { Groomer } from './mod_groomer.js';

// ⚠️ REMOVIDO: Definição duplicada do GCOracle
// O GCOracle agora vem do mod_gc.js

export const Executor = {
    isRunning: false,
    shouldStop: false,
    testCount: 0,

    stop: function() {
        this.shouldStop = true;
        this.isRunning = false;
    },

    /**
     * Ciclo principal do Fuzzer
     */
    run: async function* (scenarios) {
        this.isRunning = true;
        this.shouldStop = false;
        this.testCount = 0;

        while (!this.shouldStop) {
            for (const scenario of scenarios) {
                if (this.shouldStop) break;

                this.testCount++;
                yield { type: 'STATUS', target: scenario.id };
                yield { type: 'TICK', count: this.testCount };

                try {
                    // 1. Setup & Baseline
                    scenario.setup();
                    const baselines = scenario.probe.map(p => {
                        const start = performance.now();
                        const val = p(scenario);
                        const end = performance.now();
                        return {
                            repr: String(val),
                            type: typeof val,
                            time: end - start,
                            fnStr: p.toString(),
                            ok: true
                        };
                    });

                    // 2. Trigger (O ataque)
                    if (scenario.trigger.constructor.name === 'AsyncFunction') {
                        await scenario.trigger();
                    } else {
                        scenario.trigger();
                    }

                    // 3. Probing & Telemetria
                    for (let i = 0; i < scenario.probe.length; i++) {
                        const start = performance.now();
                        const val = scenario.probe[i](scenario);
                        const end = performance.now();
                        
                        const result = this.runProbe(scenario, baselines[i], val, end - start);
                        if (result.anomaly) {
                            yield {
                                type: 'ANOMALY',
                                risk: scenario.risk,
                                api: `${scenario.id} — probe[${i}]`,
                                telemetry: result.telemetry,
                                reason: result.reason
                            };
                        }
                    }
                } catch (e) {
                    // Silenciamos erros esperados de execução para não travar o loop
                    yield {
                        type: 'DEBUG',
                        scenario: scenario.id,
                        error: e.message
                    };
                } finally {
                    scenario.cleanup();
                }
            }
            // Pequena pausa para o Event Loop respirar e o GC agir
            await new Promise(r => setTimeout(r, 10));
        }
    },

    /**
     * Analisador de anomalias (O Radar Sniper)
     */
    /**
 * Analisador de anomalias CORRIGIDO
 * Filtra falsos positivos de probes que retornam erro
 */
runProbe: function(scenario, base, val, deltaMs) {
    const result = { anomaly: false, telemetry: '', reason: '' };
    const valRepr = String(val);
    const valType = typeof val;

    // --- FILTRO ANTI-FALSO-POSITIVO ---
    // Se o valor contém "ERROR" ou "DETACHED" (comportamento esperado)
    const isExpectedError = valRepr.includes('ERROR') || 
                           valRepr.includes('DETACHED') ||
                           valRepr === '-1'; // Nosso marcador de detached
    
    // Se baseline é número e valor é string de erro, IGNORAR
    if (base.type === 'number' && valType === 'string' && isExpectedError) {
        return result; // Não é anomalia, é comportamento esperado
    }
    
    // Se ambos são -1 (nosso marcador), também ignorar
    if (base.repr === '-1' && valRepr === '-1') {
        return result;
    }

    // --- 1. GCOracle: GHOST LEAK ---
    const tag = `${scenario.id}_target`;
    if (GCOracle.freedTags.has(tag)) {
        if (valType !== base.type && val !== null && val !== undefined && valRepr !== base.repr) {
            result.anomaly = true;
            result.telemetry = 'CONFIRMED_UAF_GHOST';
            result.reason = `[GHOST LEAK] Objeto coletado mutou: ${base.type} -> ${valType}. Valor: ${valRepr.slice(0, 30)}`;
            return result;
        }
    }

    // --- 2. TIMING ANOMALY ---
    const TIMING_THRESHOLD_MS = 150;
    const isLayoutProbe = base.fnStr.includes('getBoundingClientRect') 
                       || base.fnStr.includes('offsetWidth')
                       || base.fnStr.includes('getComputedStyle');

    if (base.ok && deltaMs > TIMING_THRESHOLD_MS && !isLayoutProbe) {
        result.anomaly = true;
        result.telemetry = 'TIMING_ANOMALY';
        result.reason = `[ENGINE HANG] Loop bloqueante: ${deltaMs.toFixed(2)}ms`;
        return result;
    }

    // --- 3. CUSTOM ALERTS (💥, 🏆, LEAK) ---
    const isCustomAlert = valType === 'string' && 
                         (val.includes('💥') || val.includes('🏆') || val.includes('LEAK'));
    
    if (isCustomAlert) {
        result.anomaly = true;
        result.telemetry = 'CUSTOM_LEAK';
        result.reason = val;
        return result;
    }

    // --- 4. TYPE CONFUSION REAL ---
    // Só alerta se NÃO for erro esperado
    if (valType !== base.type && base.type !== 'undefined' && val !== null && !isExpectedError) {
        result.anomaly = true;
        result.telemetry = 'TYPE_CONFUSION';
        result.reason = `[TYPE CONFUSION] ${base.type} -> ${valType}. Baseline: ${base.repr} | Pós: ${valRepr}`;
        return result;
    }

    // --- 5. BOOLEAN FLIP ---
    if (base.type === 'boolean' && valType === 'boolean') {
        const flipped = val !== (base.repr === 'true');
        if (flipped && GCOracle.freedTags.has(tag)) {
            result.anomaly = true;
            result.telemetry = 'BOOLEAN_FLIP';
            result.reason = `[BOOLEAN FLIP + GC] ${base.repr} -> ${val}`;
            return result;
        }
    }

    // --- 6. STALE DATA (Info Leaks & NaN-Boxing) ---
if (base.type === 'number' && valType === 'number' && !isNaN(val)) {
    const baseNum = parseFloat(base.repr);
    
    // ⚠️ FILTRO CRÍTICO: Ignora nosso marcador -1 (detached/error esperado)
    if (val === -1 && baseNum !== -1) {
        // A probe retornou -1 (nosso código de erro esperado)
        // NÃO é vazamento, é comportamento controlado
        return result;
    }
    
    // ⚠️ FILTRO: Ignora se baseline é 0xDEADBEEF (valor de preenchimento)
    // e resultado é -1 (nosso marcador de detached)
    if (baseNum === 0xDEADBEEF && val === -1) {
        return result; // Buffer detached esperado
    }
    
    // ⚠️ FILTRO: Ignora valores Float64 extremos que são lixo de memória esperado
    if (Math.abs(baseNum) > 1e100 && val === -1) {
        return result; // Float view detached esperado
    }
    
    if (Math.abs(val - baseNum) > 10000 || (baseNum === 0 && (val < -10000 || val > 10000))) {
        
        // NaN-Boxing analysis
        const buf = new ArrayBuffer(8);
        const f64 = new Float64Array(buf);
        const u64 = new BigUint64Array(buf);
        f64[0] = val;
        const bits = u64[0];
        
        const addr = bits & 0x0000FFFFFFFFFFFFn;
        const upper16 = (bits >> 48n) & 0xFFFFn;

        let diagnostic = `Vazamento Numérico: ${base.repr} -> ${val}`;
        
        if (upper16 === 0x0000n && addr > 0x100000n) {
            diagnostic = `💥 PONTEIRO NATIVO: 0x${addr.toString(16)}`;
        } else if (upper16 === 0xFFFFn) {
            const intVal = Number(bits & 0xFFFFFFFFn);
            diagnostic = `💥 JSValue Int32 Interno: 0x${bits.toString(16)} (int=${intVal})`;
        }

        result.anomaly = true;
        result.telemetry = 'STALE_DATA';
        result.reason = diagnostic;
        return result;
    }
}

    return result;
}
};
