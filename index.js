/**
 * INDEX.JS — PS4 Fuzzer Main Entry Point
 * CORRIGIDO: Importa GCOracle do módulo correto
 */

// ⚠️ CORREÇÃO: Import do GCOracle do mod_gc.js, não do mod_executor.js
import { GC, GCOracle } from './mod_gc.js';
import { Executor } from './mod_executor.js';
import { Groomer } from './mod_groomer.js';
import { Telemetry } from './mod_telemetry.js';
import { Scenarios } from './mod_scenarios.js';

// Estado global
const State = {
    isRunning: false,
    testCount: 0,
    anomalyCount: 0,
    gcEvents: 0,
    selectedScenarios: new Set(),
    fpsInterval: null,
    testTimes: [],
    
    /**
     * Inicializa a aplicação
     */
    async init() {
        console.log('🚀 PS4 WebKit Fuzzer v13.0 Initializing...');
        
        // ⚠️ CORREÇÃO: Verifica se GCOracle.init existe
        if (typeof GCOracle.init === 'function') {
            const gcActive = GCOracle.init();
            console.log(`  GCOracle: ${gcActive ? '✅ Active' : '⚠️ Not available'}`);
        } else {
            console.warn('  GCOracle: ❌ init method not found');
        }
        
        // Detecta capacidades do ambiente
        await this.detectEnvironment();
        
        // Renderiza cenários
        this.renderScenarios();
        
        // Configura event listeners
        this.setupControls();
        
        // Inicia monitor de GC
        this.startGCMonitor();
        
        console.log('✅ Fuzzer initialized successfully');
        this.log('System', 'Fuzzer v13.0 ready for PS4 13.50 WebKit testing');
    },
    
    /**
     * Detecta ambiente e capacidades
     */
    async detectEnvironment() {
        const env = {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            
            // APIs Gráficas
            canvas: !!document.createElement('canvas').getContext,
            webgl: (() => {
                try {
                    return !!document.createElement('canvas').getContext('webgl');
                } catch(e) { return false; }
            })(),
            offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
            
            // APIs JS Engine
            wasm: typeof WebAssembly !== 'undefined',
            sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
            atomics: typeof Atomics !== 'undefined',
            bigint: typeof BigInt !== 'undefined',
            weakRef: typeof WeakRef !== 'undefined',
            finalizationRegistry: typeof FinalizationRegistry !== 'undefined',
            
            // APIs Web/DOM
            worker: typeof Worker !== 'undefined',
            serviceWorker: typeof ServiceWorker !== 'undefined',
            fetch: typeof fetch !== 'undefined',
            websocket: typeof WebSocket !== 'undefined',
            
            // Timing
            performanceNow: typeof performance.now === 'function',
            gcAvailable: typeof gc === 'function',
            
            // Memória
            memory: performance?.memory || null
        };
        
        const envInfoEl = document.getElementById('envInfo');
        if (envInfoEl) {
            envInfoEl.innerHTML = `
                ${env.userAgent}<br>
                Canvas: ${env.canvas ? '✅' : '❌'} | 
                WebGL: ${env.webgl ? '✅' : '❌'} | 
                WASM: ${env.wasm ? '✅' : '❌'} | 
                SAB: ${env.sharedArrayBuffer ? '✅' : '❌'} | 
                WeakRef: ${env.weakRef ? '✅' : '❌'} | 
                FinRegistry: ${env.finalizationRegistry ? '✅' : '❌'} |
                GC: ${env.gcAvailable ? '✅' : '⚠️'}
                ${env.memory ? ` | Heap: ${(env.memory.usedJSHeapSize/1048576).toFixed(1)}MB` : ''}
            `;
        }
        
        return env;
    },
    
    /**
     * Renderiza cards de cenários
     */
    renderScenarios() {
        const grid = document.getElementById('scenarioGrid');
        if (!grid) return;
        
        grid.innerHTML = '';
        
        const scenarioEntries = Object.entries(Scenarios);
        if (scenarioEntries.length === 0) {
            grid.innerHTML = '<div style="padding:20px;color:#888;">No scenarios loaded</div>';
            return;
        }
        
        for (const [name, scenario] of scenarioEntries) {
            const card = document.createElement('div');
            card.className = 'scenario-card';
            card.dataset.scenario = name;
            card.innerHTML = `
                <h3>${name.replace(/([A-Z])/g, ' $1').trim()}</h3>
                <div class="risk-${scenario.risk}">Risk: ${scenario.risk}</div>
                <div>ID: ${scenario.id}</div>
                <div>Probes: ${scenario.probe?.length || 0}</div>
                <label style="display: block; margin-top: 10px;">
                    <input type="checkbox" class="scenario-check" 
                           data-scenario="${name}" 
                           ${this.isRecommended(name) ? 'checked' : ''}>
                    Enable
                </label>
            `;
            
            card.addEventListener('click', (e) => {
                if (e.target.tagName !== 'INPUT') {
                    const checkbox = card.querySelector('.scenario-check');
                    if (checkbox) {
                        checkbox.checked = !checkbox.checked;
                        this.updateSelectedScenarios();
                    }
                }
            });
            
            grid.appendChild(card);
        }
        
        this.updateSelectedScenarios();
    },
    
    /**
     * Cenários recomendados baseado no ambiente
     */
    isRecommended(name) {
        // PS4 13.50: foca em canvas e DOM que funcionam
        const recommended = ['canvasPixelStealing', 'domClobbering', 'prototypePollution'];
        return recommended.includes(name);
    },
    
    /**
     * Atualiza seleção de cenários
     */
    updateSelectedScenarios() {
        this.selectedScenarios.clear();
        document.querySelectorAll('.scenario-check:checked').forEach(cb => {
            this.selectedScenarios.add(cb.dataset.scenario);
            const card = cb.closest('.scenario-card');
            if (card) card.classList.add('active');
        });
        document.querySelectorAll('.scenario-check:not(:checked)').forEach(cb => {
            const card = cb.closest('.scenario-card');
            if (card) card.classList.remove('active');
        });
    },
    
    /**
     * Configura controles
     */
    setupControls() {
        const startAll = document.getElementById('btnStartAll');
        const stopAll = document.getElementById('btnStopAll');
        const clearLogs = document.getElementById('btnClearLogs');
        const exportReport = document.getElementById('btnExportReport');
        const runSingle = document.getElementById('btnRunSingle');
        
        if (startAll) startAll.addEventListener('click', () => this.startFuzzing(false));
        if (stopAll) stopAll.addEventListener('click', () => this.stopFuzzing());
        if (clearLogs) clearLogs.addEventListener('click', () => this.clearLogs());
        if (exportReport) exportReport.addEventListener('click', () => this.exportReport());
        if (runSingle) runSingle.addEventListener('click', () => this.startFuzzing(true));
    },
    
    /**
     * Inicia fuzzing
     */
    async startFuzzing(singlePass = false) {
        if (this.isRunning) return;
        
        this.isRunning = true;
        this.testCount = 0;
        this.anomalyCount = 0;
        this.testTimes = [];
        
        this.log('Executor', `Starting fuzz cycle (${singlePass ? 'single pass' : 'continuous'})`);
        
        // Prepara cenários selecionados
        const scenariosToRun = [];
        for (const name of this.selectedScenarios) {
            if (Scenarios[name]) {
                scenariosToRun.push(Scenarios[name]);
            }
        }
        
        if (scenariosToRun.length === 0) {
            this.log('Executor', '⚠️ No scenarios selected');
            this.isRunning = false;
            return;
        }
        
        this.log('Executor', `📋 ${scenariosToRun.length} scenarios loaded`);
        
        // Prepara o heap
        this.log('Groomer', 'Preparing heap...');
        try {
            Groomer.sprayObjects(500);
            Groomer.fragmentHeap();
            if (typeof gc === 'function') gc();
        } catch (e) {
            console.warn('Heap preparation warning:', e);
        }
        
        // Inicia contador de FPS
        this.startFPSCounter();
        
        // Executa fuzzing
        try {
            const generator = Executor.run(scenariosToRun);
            
            for await (const event of generator) {
                this.handleExecutorEvent(event);
                
                if (singlePass && event.type === 'ANOMALY') {
                    this.log('Executor', 'Single pass mode: anomaly found, stopping');
                    break;
                }
                
                // Yield para não travar a UI
                if (this.testCount % 100 === 0) {
                    await new Promise(r => requestAnimationFrame(r));
                }
            }
            
        } catch (e) {
            this.log('Executor', `❌ Error: ${e.message}`);
            console.error('Fuzzing error:', e);
        }
        
        this.stopFuzzing();
    },
    
    /**
     * Para fuzzing
     */
    stopFuzzing() {
        this.isRunning = false;
        Executor.stop();
        this.stopFPSCounter();
        
        this.log('Executor', `⏹ Stopped. Total: ${this.testCount} tests, ${this.anomalyCount} anomalies`);
        this.updateStats();
    },
    
    /**
     * Processa eventos do executor
     */
    handleExecutorEvent(event) {
        switch (event.type) {
            case 'TICK':
                this.testCount = event.count;
                this.updateStats();
                break;
                
            case 'STATUS':
                // Progress update
                const progressBar = document.getElementById('progressBar');
                if (progressBar && this.selectedScenarios.size > 0) {
                    const progress = (this.testCount % 100) / 100 * 100;
                    progressBar.style.width = `${progress}%`;
                }
                break;
                
            case 'ANOMALY':
                this.anomalyCount++;
                this.log('ANOMALY', `${event.api}: ${event.reason}`, event);
                this.updateStats();
                this.flashAnomaly();
                break;
                
            case 'DEBUG':
                console.debug(`[${event.scenario}] ${event.error}`);
                break;
        }
    },
    
    /**
     * Flash visual para anomalia
     */
    flashAnomaly() {
        document.body.style.backgroundColor = '#1a0000';
        setTimeout(() => {
            document.body.style.backgroundColor = 'var(--bg, #0a0a0a)';
        }, 100);
    },
    
    /**
     * Atualiza estatísticas
     */
    updateStats() {
        const testCountEl = document.getElementById('testCount');
        const anomalyCountEl = document.getElementById('anomalyCount');
        const gcCountEl = document.getElementById('gcCount');
        const fpsCounterEl = document.getElementById('fpsCounter');
        
        if (testCountEl) testCountEl.textContent = this.testCount.toLocaleString();
        if (anomalyCountEl) anomalyCountEl.textContent = this.anomalyCount.toLocaleString();
        if (gcCountEl) gcCountEl.textContent = this.gcEvents;
        
        // Calcula FPS
        if (fpsCounterEl && this.testTimes.length > 1) {
            const timeRange = this.testTimes[this.testTimes.length - 1] - this.testTimes[0];
            if (timeRange > 0) {
                const fps = 1000 / timeRange * this.testTimes.length;
                fpsCounterEl.textContent = fps.toFixed(1);
            }
        }
    },
    
    /**
     * Contador de FPS
     */
    startFPSCounter() {
        this.testTimes = [];
        this.fpsInterval = setInterval(() => {
            const now = performance.now();
            this.testTimes.push(now);
            if (this.testTimes.length > 100) {
                this.testTimes.shift();
            }
        }, 100);
    },
    
    stopFPSCounter() {
        if (this.fpsInterval) {
            clearInterval(this.fpsInterval);
            this.fpsInterval = null;
        }
    },
    
    /**
     * Monitor de GC
     */
    startGCMonitor() {
        this.gcMonitorInterval = setInterval(() => {
            try {
                const collected = GC.checkCollected();
                if (collected.length > 0) {
                    this.gcEvents += collected.length;
                    for (const tag of collected) {
                        GCOracle.freedTags.add(tag);
                    }
                    this.updateStats();
                }
            } catch (e) {
                // GC monitor error - non-critical
            }
        }, 1000);
    },
    
    /**
     * Logging system
     */
    log(type, message, data = null) {
        const container = document.getElementById('logContainer');
        if (!container) return;
        
        const entry = document.createElement('div');
        entry.className = `log-entry ${type.toLowerCase()}`;
        
        const time = new Date().toLocaleTimeString();
        entry.innerHTML = `
            <span style="color: #666;">[${time}]</span>
            <span style="color: var(--accent, #00ccff);">[${type}]</span>
            ${message}
        `;
        
        container.appendChild(entry);
        container.scrollTop = container.scrollHeight;
        
        // Limita entradas
        while (container.children.length > 500) {
            container.removeChild(container.firstChild);
        }
        
        // Também loga na telemetria se disponível
        if (typeof Telemetry !== 'undefined' && Telemetry.log) {
            Telemetry.log({
                type: type,
                message: message,
                data: data
            });
        }
    },
    
    /**
     * Limpa logs
     */
    clearLogs() {
        const container = document.getElementById('logContainer');
        if (container) {
            container.innerHTML = '';
        }
        this.log('System', 'Logs cleared');
    },
    
    /**
     * Exporta relatório
     */
    exportReport() {
        const report = {
            timestamp: new Date().toISOString(),
            environment: {
                userAgent: navigator.userAgent,
                gcAvailable: typeof gc === 'function',
                memory: performance?.memory || null
            },
            stats: {
                testCount: this.testCount,
                anomalyCount: this.anomalyCount,
                gcEvents: this.gcEvents
            },
            telemetry: typeof Telemetry !== 'undefined' ? Telemetry.report() : {},
            scenarioResults: []
        };
        
        for (const [name, scenario] of Object.entries(Scenarios)) {
            report.scenarioResults.push({
                name: name,
                id: scenario.id,
                risk: scenario.risk,
                tested: this.selectedScenarios.has(name)
            });
        }
        
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `ps4-fuzzer-report-${Date.now()}.json`;
        a.click();
        
        URL.revokeObjectURL(url);
        this.log('System', '📄 Report exported');
    }
};

// Inicializa quando o DOM estiver pronto
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => State.init());
} else {
    State.init();
}

// Exporta para console (útil para debugging)
window.FuzzerState = State;
console.log('PS4 Fuzzer: State available at window.FuzzerState');
