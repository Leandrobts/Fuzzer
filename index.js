/**
 * INDEX.JS — PS4 Fuzzer Main Entry Point
 * Orquestra todos os módulos e interface
 */

import { Executor, GCOracle } from './mod_executor.js';
import { GC } from './mod_gc.js';
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
        
        // Inicializa GCOracle
        GCOracle.init();
        console.log(`  GCOracle: ${GCOracle.registry ? '✅ Active' : '⚠️ Not available'}`);
        
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
        
        document.getElementById('envInfo').innerHTML = `
            ${env.userAgent}<br>
            Canvas: ${env.canvas ? '✅' : '❌'} | 
            WebGL: ${env.webgl ? '✅' : '❌'} | 
            WASM: ${env.wasm ? '✅' : '❌'} | 
            SAB: ${env.sharedArrayBuffer ? '✅' : '❌'} | 
            WeakRef: ${env.weakRef ? '✅' : '❌'} | 
            GC: ${env.gcAvailable ? '✅' : '⚠️'}
            ${env.memory ? ` | Heap: ${(env.memory.usedJSHeapSize/1048576).toFixed(1)}MB` : ''}
        `;
        
        return env;
    },
    
    /**
     * Renderiza cards de cenários
     */
    renderScenarios() {
        const grid = document.getElementById('scenarioGrid');
        grid.innerHTML = '';
        
        for (const [name, scenario] of Object.entries(Scenarios)) {
            const card = document.createElement('div');
            card.className = 'scenario-card';
            card.dataset.scenario = name;
            card.innerHTML = `
                <h3>${name.replace(/([A-Z])/g, ' $1').trim()}</h3>
                <div class="risk-${scenario.risk}">Risk: ${scenario.risk}</div>
                <div>ID: ${scenario.id}</div>
                <div>Probes: ${scenario.probe.length}</div>
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
                    checkbox.checked = !checkbox.checked;
                    this.updateSelectedScenarios();
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
            cb.closest('.scenario-card').classList.add('active');
        });
        document.querySelectorAll('.scenario-check:not(:checked)').forEach(cb => {
            cb.closest('.scenario-card').classList.remove('active');
        });
    },
    
    /**
     * Configura controles
     */
    setupControls() {
        document.getElementById('btnStartAll').addEventListener('click', () => this.startFuzzing());
        document.getElementById('btnStopAll').addEventListener('click', () => this.stopFuzzing());
        document.getElementById('btnClearLogs').addEventListener('click', () => this.clearLogs());
        document.getElementById('btnExportReport').addEventListener('click', () => this.exportReport());
        document.getElementById('btnRunSingle').addEventListener('click', () => {
            this.startFuzzing(true);
        });
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
        Groomer.sprayObjects(500);
        Groomer.fragmentHeap();
        if (typeof gc === 'function') gc();
        
        // Inicia contador de FPS
        this.startFPSCounter();
        
        // Executa fuzzing
        try {
            const generator = Executor.run(scenariosToRun);
            
            for await (const event of generator) {
                this.handleExecutorEvent(event);
                
                if (singlePass && event.type === 'ANOMALY') {
                    break; // Para após primeira anomalia
                }
                
                // Yield para não travar a UI
                if (this.testCount % 100 === 0) {
                    await new Promise(r => requestAnimationFrame(r));
                }
            }
            
        } catch (e) {
            this.log('Executor', `❌ Error: ${e.message}`);
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
                // Update progress
                break;
                
            case 'ANOMALY':
                this.anomalyCount++;
                this.log('ANOMALY', `${event.api}: ${event.reason}`, event);
                this.updateStats();
                
                // Highlight visual
                this.flashAnomaly();
                break;
        }
    },
    
    /**
     * Flash visual para anomalia
     */
    flashAnomaly() {
        document.body.style.backgroundColor = '#1a0000';
        setTimeout(() => {
            document.body.style.backgroundColor = 'var(--bg)';
        }, 100);
    },
    
    /**
     * Atualiza estatísticas
     */
    updateStats() {
        document.getElementById('testCount').textContent = this.testCount.toLocaleString();
        document.getElementById('anomalyCount').textContent = this.anomalyCount.toLocaleString();
        document.getElementById('gcCount').textContent = this.gcEvents;
        
        // Calcula FPS
        if (this.testTimes.length > 1) {
            const fps = 1000 / (this.testTimes[this.testTimes.length - 1] - this.testTimes[0]) * this.testTimes.length;
            document.getElementById('fpsCounter').textContent = fps.toFixed(1);
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
            
            // Mantém apenas últimos 100
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
        setInterval(() => {
            const collected = GC.checkCollected();
            if (collected.length > 0) {
                this.gcEvents += collected.length;
                for (const tag of collected) {
                    GCOracle.freedTags.add(tag);
                }
            }
        }, 1000);
    },
    
    /**
     * Logging system
     */
    log(type, message, data = null) {
        const container = document.getElementById('logContainer');
        const entry = document.createElement('div');
        entry.className = `log-entry ${type.toLowerCase()}`;
        
        const time = new Date().toLocaleTimeString();
        entry.innerHTML = `
            <span style="color: #666;">[${time}]</span>
            <span style="color: var(--accent);">[${type}]</span>
            ${message}
        `;
        
        container.appendChild(entry);
        container.scrollTop = container.scrollHeight;
        
        // Limita entradas
        while (container.children.length > 500) {
            container.removeChild(container.firstChild);
        }
        
        // Também loga na telemetria
        Telemetry.log({
            type: type,
            message: message,
            data: data
        });
    },
    
    /**
     * Limpa logs
     */
    clearLogs() {
        document.getElementById('logContainer').innerHTML = '';
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
                memory: performance?.memory
            },
            stats: {
                testCount: this.testCount,
                anomalyCount: this.anomalyCount,
                gcEvents: this.gcEvents
            },
            telemetry: Telemetry.report(),
            scenarioResults: []
        };
        
        // Coleta resultados por cenário
        for (const [name, scenario] of Object.entries(Scenarios)) {
            if (this.selectedScenarios.has(name)) {
                report.scenarioResults.push({
                    name: name,
                    id: scenario.id,
                    risk: scenario.risk,
                    tested: true
                });
            }
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

// Exporta para console
window.Fuzzer = State;
window.Scenarios = Scenarios;
window.Telemetry = Telemetry;
window.GC = GC;
window.Groomer = Groomer;
