/**
 * INDEX.JS — PS4 Fuzzer Main Entry Point (CORRIGIDO)
 * Agora carrega e atualiza dinamicamente os cenários
 */

import { GC, GCOracle } from './mod_gc.js';
import { Executor } from './mod_executor.js';
import { Groomer } from './mod_groomer.js';
import { Telemetry } from './mod_telemetry.js';
import { Scenarios, ScenarioInfo } from './mod_scenarios.js';

// Estado global
const State = {
    isRunning: false,
    testCount: 0,
    anomalyCount: 0,
    gcEvents: 0,
    selectedScenarios: new Set(),
    fpsInterval: null,
    testTimes: [],
    scenarioResults: {},  // Armazena resultados por cenário
    
    /**
     * Inicializa a aplicação
     */
    async init() {
        console.log('%c🚀 PS4 WebKit Fuzzer v13.0 Initializing...', 'color: #00ff00; font-size: 16px');
        
        // Inicializa GCOracle
        if (typeof GCOracle.init === 'function') {
            const gcActive = GCOracle.init();
            console.log(`%c  GCOracle: ${gcActive ? '✅ Active' : '⚠️ Not available'}`, 
                gcActive ? 'color: #00ff00' : 'color: #ffaa00');
        }
        
        // Detecta capacidades do ambiente
        const env = await this.detectEnvironment();
        
        // Atualiza info do ambiente
        this.updateEnvironmentDisplay(env);
        
        // Renderiza cenários (TODOS agora)
        this.renderScenarios();
        
        // Configura event listeners
        this.setupControls();
        
        // Inicia monitor de GC
        this.startGCMonitor();
        
        // Inicia atualização periódica da UI
        this.startUIUpdater();
        
        console.log('%c✅ Fuzzer initialized successfully', 'color: #00ff00');
        console.log(`%c   Scenarios: ${ScenarioInfo.total} total | PS4 Compatible: ${ScenarioInfo.getPS4Compatible().length}`, 'color: #888');
        
        this.log('System', `Fuzzer v13.0 ready - ${ScenarioInfo.total} testes disponíveis`);
    },
    
    /**
     * Detecta ambiente e capacidades
     */
    async detectEnvironment() {
        return {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            canvas: !!document.createElement('canvas').getContext,
            webgl: (() => {
                try { return !!document.createElement('canvas').getContext('webgl'); } 
                catch(e) { return false; }
            })(),
            offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
            wasm: typeof WebAssembly !== 'undefined',
            sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
            atomics: typeof Atomics !== 'undefined',
            bigint: typeof BigInt !== 'undefined',
            weakRef: typeof WeakRef !== 'undefined',
            finalizationRegistry: typeof FinalizationRegistry !== 'undefined',
            worker: typeof Worker !== 'undefined',
            serviceWorker: typeof ServiceWorker !== 'undefined',
            fetch: typeof fetch !== 'undefined',
            websocket: typeof WebSocket !== 'undefined',
            performanceNow: typeof performance.now === 'function',
            gcAvailable: typeof gc === 'function',
            memory: performance?.memory || null
        };
    },
    
    /**
     * Atualiza display de ambiente
     */
    updateEnvironmentDisplay(env) {
        const el = document.getElementById('envInfo');
        if (!el) return;
        
        const memoryInfo = env.memory ? 
            ` | Heap: ${(env.memory.usedJSHeapSize/1048576).toFixed(1)}MB/${(env.memory.jsHeapSizeLimit/1048576).toFixed(1)}MB` : '';
        
        el.innerHTML = `
            <strong>${env.userAgent}</strong><br>
            <span style="font-size:11px">
            Canvas: ${env.canvas ? '✅' : '❌'} | 
            WebGL: ${env.webgl ? '✅' : '❌'} | 
            WASM: ${env.wasm ? '✅' : '❌'} | 
            SAB: ${env.sharedArrayBuffer ? '✅' : '❌'} | 
            WeakRef: ${env.weakRef ? '✅' : '❌'} |
            GC: ${env.gcAvailable ? '✅' : '⚠️'} |
            Worker: ${env.worker ? '✅' : '❌'}
            ${memoryInfo}
            </span>
        `;
    },
    
    /**
     * Renderiza TODOS os cards de cenários
     */
    renderScenarios() {
        const grid = document.getElementById('scenarioGrid');
        if (!grid) return;
        
        grid.innerHTML = '';
        
        const entries = Object.entries(Scenarios);
        
        if (entries.length === 0) {
            grid.innerHTML = '<div style="padding:20px;color:#ff4444;">❌ Nenhum cenário carregado!</div>';
            return;
        }
        
        // Agrupa por categoria
        const categories = {};
        for (const [name, scenario] of entries) {
            const cat = scenario.category || 'UNKNOWN';
            if (!categories[cat]) categories[cat] = [];
            categories[cat].push({ name, scenario });
        }
        
        // Renderiza por categoria
        for (const [category, tests] of Object.entries(categories)) {
            // Adiciona header de categoria
            const catHeader = document.createElement('div');
            catHeader.style.cssText = 'grid-column:1/-1;color:#888;font-size:12px;padding:5px 0;border-bottom:1px solid #333;';
            catHeader.textContent = `📁 ${category} (${tests.length} teste${tests.length > 1 ? 's' : ''})`;
            grid.appendChild(catHeader);
            
            // Renderiza cada teste
            for (const { name, scenario } of tests) {
                const card = this.createScenarioCard(name, scenario);
                grid.appendChild(card);
            }
        }
        
        this.updateSelectedScenarios();
    },
    
    /**
     * Cria card de cenário individual
     */
    createScenarioCard(name, scenario) {
        const card = document.createElement('div');
        card.className = 'scenario-card';
        card.dataset.scenario = name;
        
        const riskColor = {
            'LOW': '#ffaa00',
            'MEDIUM': '#ff8800',
            'HIGH': '#ff4444',
            'CRITICAL': '#ff0000'
        }[scenario.risk] || '#888';
        
        const isPS4 = scenario.ps4Compatible !== false;
        const probeCount = Array.isArray(scenario.probe) ? scenario.probe.length : 0;
        const description = scenario.description || scenario.name || scenario.id;
        
        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:start;">
                <h3 style="margin:0;font-size:14px;">${(scenario.name || name).replace(/([A-Z])/g, ' $1').trim()}</h3>
                ${isPS4 ? '<span style="color:#00ff00;font-size:10px;">🎮 PS4</span>' : ''}
            </div>
            <div style="color:${riskColor};font-weight:bold;font-size:11px;">⚠ ${scenario.risk}</div>
            <div style="font-size:10px;color:#888;">ID: ${scenario.id}</div>
            <div style="font-size:10px;color:#666;">Probes: ${probeCount}</div>
            <div style="font-size:10px;color:#555;margin-top:3px;">${description}</div>
            <div class="scenario-result" style="font-size:10px;margin-top:5px;display:none;"></div>
            <label style="display:block;margin-top:8px;">
                <input type="checkbox" class="scenario-check" 
                       data-scenario="${name}" 
                       ${this.isRecommended(name) ? 'checked' : ''}>
                <span style="font-size:11px;">Enable</span>
            </label>
        `;
        
        // Evento de clique no card (toggle checkbox)
        card.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'LABEL') {
                const checkbox = card.querySelector('.scenario-check');
                if (checkbox) {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        });
        
        // Evento de mudança no checkbox
        const checkbox = card.querySelector('.scenario-check');
        checkbox.addEventListener('change', () => {
            this.updateSelectedScenarios();
        });
        
        return card;
    },
    
    /**
     * Cenários recomendados baseado no ambiente
     */
    isRecommended(name) {
        const scenario = Scenarios[name];
        if (!scenario) return false;
        
        // No PS4, prioriza cenários que funcionam
        const isPS4 = navigator.userAgent.includes('PlayStation');
        
        if (isPS4) {
            const ps4Recommended = [
                'canvasPixelStealing', 
                'domClobbering', 
                'prototypePollution',
                'arraybufferNeutering',
                'timingSideChannel'
            ];
            return ps4Recommended.includes(name);
        }
        
        // Desktop: todos recomendados
        return true;
    },
    
    /**
     * Atualiza seleção de cenários
     */
    updateSelectedScenarios() {
        const previousCount = this.selectedScenarios.size;
        this.selectedScenarios.clear();
        
        document.querySelectorAll('.scenario-check:checked').forEach(cb => {
            const scenarioName = cb.dataset.scenario;
            this.selectedScenarios.add(scenarioName);
            
            // Atualiza visual do card
            const card = cb.closest('.scenario-card');
            if (card) card.classList.add('active');
        });
        
        document.querySelectorAll('.scenario-check:not(:checked)').forEach(cb => {
            const card = cb.closest('.scenario-card');
            if (card) card.classList.remove('active');
        });
        
        // Log se mudou
        if (previousCount !== this.selectedScenarios.size) {
            console.log(`%c📋 Scenarios selecionados: ${this.selectedScenarios.size}`, 'color: #00ccff');
        }
    },
    
    /**
     * Configura controles
     */
    setupControls() {
        const bind = (id, event, handler) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener(event, handler.bind(this));
            else console.warn(`Elemento #${id} não encontrado`);
        };
        
        bind('btnStartAll', 'click', () => this.startFuzzing(false));
        bind('btnStopAll', 'click', () => this.stopFuzzing());
        bind('btnClearLogs', 'click', () => this.clearLogs());
        bind('btnExportReport', 'click', () => this.exportReport());
        bind('btnRunSingle', 'click', () => this.startFuzzing(true));
        bind('btnSelectAll', 'click', () => this.selectAllScenarios());
        bind('btnDeselectAll', 'click', () => this.deselectAllScenarios());
        
        // Tecla de atalho: ESC para parar
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.stopFuzzing();
            }
        });
    },
    
    /**
     * Seleciona todos os cenários
     */
    selectAllScenarios() {
        document.querySelectorAll('.scenario-check').forEach(cb => {
            cb.checked = true;
        });
        this.updateSelectedScenarios();
        this.log('UI', `✅ Todos os ${ScenarioInfo.total} cenários selecionados`);
    },
    
    /**
     * Deseleciona todos
     */
    deselectAllScenarios() {
        document.querySelectorAll('.scenario-check').forEach(cb => {
            cb.checked = false;
        });
        this.updateSelectedScenarios();
        this.log('UI', '❌ Todos os cenários deselecionados');
    },
    
    /**
     * Inicia fuzzing
     */
    async startFuzzing(singlePass = false) {
        if (this.isRunning) {
            this.log('Executor', '⚠️ Fuzzer já está rodando');
            return;
        }
        
        // Atualiza seleção
        this.updateSelectedScenarios();
        
        if (this.selectedScenarios.size === 0) {
            this.log('Executor', '⚠️ Nenhum cenário selecionado! Selecione pelo menos um.');
            return;
        }
        
        this.isRunning = true;
        this.testCount = 0;
        this.anomalyCount = 0;
        this.testTimes = [];
        this.scenarioResults = {};
        
        this.log('Executor', `🚀 Iniciando fuzz cycle (${singlePass ? 'único' : 'contínuo'})`);
        
        // Prepara cenários
        const scenariosToRun = [];
        for (const name of this.selectedScenarios) {
            if (Scenarios[name] && ScenarioInfo.isValid(name)) {
                scenariosToRun.push(Scenarios[name]);
            } else {
                console.warn(`Cenário inválido: ${name}`);
            }
        }
        
        this.log('Executor', `📋 ${scenariosToRun.length} cenários válidos carregados`);
        
        // Lista cenários
        scenariosToRun.forEach(s => {
            this.log('Executor', `   └─ ${s.id} [${s.risk}]`);
        });
        
        // Prepara heap
        this.log('Groomer', 'Preparando heap...');
        try {
            Groomer.sprayObjects(500);
            Groomer.fragmentHeap();
            if (typeof gc === 'function') gc();
            this.log('Groomer', '✅ Heap preparado');
        } catch (e) {
            console.warn('Heap preparation warning:', e);
        }
        
        // Inicia contador FPS
        this.startFPSCounter();
        
        // Desabilita botão de start
        const startBtn = document.getElementById('btnStartAll');
        if (startBtn) startBtn.disabled = true;
        
        // Executa
        try {
            const generator = Executor.run(scenariosToRun);
            
            for await (const event of generator) {
                this.handleExecutorEvent(event);
                
                if (singlePass) {
                    if (event.type === 'ANOMALY') {
                        this.log('Executor', '⏹ Modo single: anomalia encontrada, parando');
                        break;
                    }
                    if (this.testCount >= 5000) {
                        this.log('Executor', '⏹ Modo single: 5000 testes atingidos');
                        break;
                    }
                }
                
                // Yield para UI
                if (this.testCount % 100 === 0) {
                    await new Promise(r => setTimeout(r, 0));
                }
            }
        } catch (e) {
            this.log('Executor', `❌ Erro: ${e.message}`);
            console.error('Fuzzing error:', e);
        }
        
        this.stopFuzzing();
    },
    
    /**
     * Para fuzzing
     */
    stopFuzzing() {
        const wasRunning = this.isRunning;
        this.isRunning = false;
        Executor.stop();
        this.stopFPSCounter();
        
        // Habilita botão
        const startBtn = document.getElementById('btnStartAll');
        if (startBtn) startBtn.disabled = false;
        
        if (wasRunning) {
            const summary = {
                tests: this.testCount,
                anomalies: this.anomalyCount,
                gcEvents: this.gcEvents,
                scenarios: this.selectedScenarios.size
            };
            
            this.log('Executor', `⏹ Parado | Testes: ${summary.tests} | Anomalias: ${summary.anomalies} | GC: ${summary.gcEvents}`);
            
            // Atualiza resultados nos cards
            this.updateScenarioCards();
        }
        
        this.updateStats();
    },
    
    /**
     * Atualiza cards com resultados
     */
    updateScenarioCards() {
        document.querySelectorAll('.scenario-card').forEach(card => {
            const name = card.dataset.scenario;
            const resultEl = card.querySelector('.scenario-result');
            
            if (resultEl && this.scenarioResults[name]) {
                resultEl.style.display = 'block';
                const r = this.scenarioResults[name];
                resultEl.innerHTML = `
                    Testes: ${r.count} | Anomalias: ${r.anomalies}
                `;
                resultEl.style.color = r.anomalies > 0 ? '#ff4444' : '#00ff00';
            }
        });
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
                // Tracking por cenário
                if (event.target && !this.scenarioResults[event.target]) {
                    this.scenarioResults[event.target] = { count: 0, anomalies: 0 };
                }
                if (event.target) {
                    this.scenarioResults[event.target].count++;
                }
                break;
                
            case 'ANOMALY':
                this.anomalyCount++;
                
                // Registra no cenário
                if (event.api) {
                    const scenarioId = event.api.split(' — ')[0];
                    if (this.scenarioResults[scenarioId]) {
                        this.scenarioResults[scenarioId].anomalies++;
                    }
                }
                
                this.log('ANOMALY', `${event.api}: ${event.reason}`, event);
                this.flashAnomaly();
                this.updateStats();
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
        const originalBg = document.body.style.backgroundColor;
        document.body.style.backgroundColor = '#1a0000';
        setTimeout(() => {
            document.body.style.backgroundColor = originalBg || 'var(--bg, #0a0a0a)';
        }, 150);
    },
    
    /**
     * Atualiza estatísticas da UI
     */
    updateStats() {
        const setText = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };
        
        setText('testCount', this.testCount.toLocaleString());
        setText('anomalyCount', this.anomalyCount.toLocaleString());
        setText('gcCount', this.gcEvents);
        
        // FPS
        if (this.testTimes.length > 1) {
            const timeRange = this.testTimes[this.testTimes.length - 1] - this.testTimes[0];
            const fps = timeRange > 0 ? (1000 / timeRange * this.testTimes.length) : 0;
            setText('fpsCounter', fps.toFixed(1));
        }
    },
    
    /**
     * Contador FPS
     */
    startFPSCounter() {
        this.testTimes = [];
        this.fpsInterval = setInterval(() => {
            this.testTimes.push(performance.now());
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
     * Atualizador periódico da UI
     */
    startUIUpdater() {
        setInterval(() => {
            this.updateStats();
        }, 1000);
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
                }
            } catch (e) {
                // Non-critical
            }
        }, 1000);
    },
    
    /**
     * Sistema de log
     */
    log(type, message, data = null) {
        const container = document.getElementById('logContainer');
        if (!container) return;
        
        const entry = document.createElement('div');
        entry.className = `log-entry ${type.toLowerCase()}`;
        
        const time = new Date().toLocaleTimeString();
        const color = type === 'ANOMALY' ? '#ff4444' : 
                      type === 'Executor' ? '#00ccff' : 
                      '#888';
        
        entry.innerHTML = `
            <span style="color:#666;font-size:10px;">[${time}]</span>
            <span style="color:${color};font-weight:bold;font-size:10px;">[${type}]</span>
            <span style="font-size:11px;">${message}</span>
        `;
        
        container.appendChild(entry);
        container.scrollTop = container.scrollHeight;
        
        // Limita a 500 entradas
        while (container.children.length > 500) {
            container.removeChild(container.firstChild);
        }
        
        // Telemetria
        if (typeof Telemetry !== 'undefined' && Telemetry.log) {
            Telemetry.log({ type, message, data });
        }
    },
    
    /**
     * Limpa logs
     */
    clearLogs() {
        const container = document.getElementById('logContainer');
        if (container) container.innerHTML = '';
        this.log('System', '🗑 Logs limpos');
    },
    
    /**
     * Exporta relatório
     */
    exportReport() {
        const report = {
            timestamp: new Date().toISOString(),
            environment: {
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                gcAvailable: typeof gc === 'function',
                workerAvailable: typeof Worker !== 'undefined',
                memory: performance?.memory || null
            },
            stats: {
                totalTests: this.testCount,
                totalAnomalies: this.anomalyCount,
                gcEvents: this.gcEvents,
                scenariosTested: this.selectedScenarios.size,
                scenarioResults: this.scenarioResults
            },
            telemetry: typeof Telemetry !== 'undefined' ? Telemetry.report() : {},
            scenarios: {}
        };
        
        // Detalhes de cada cenário
        for (const name of this.selectedScenarios) {
            if (Scenarios[name]) {
                report.scenarios[name] = {
                    id: Scenarios[name].id,
                    name: Scenarios[name].name,
                    risk: Scenarios[name].risk,
                    category: Scenarios[name].category,
                    results: this.scenarioResults[name] || {}
                };
            }
        }
        
        const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `ps4-fuzzer-report-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.log('System', `📄 Relatório exportado: ps4-fuzzer-report-${Date.now()}.json`);
    }
};

// Inicialização
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => State.init());
} else {
    State.init();
}

// Exporta para debugging
window.FuzzerState = State;
window.FuzzerScenarios = Scenarios;
window.FuzzerScenarioInfo = ScenarioInfo;
