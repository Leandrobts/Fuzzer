/**
 * INDEX.JS — PS4 Fuzzer Main Entry Point (VERSÃO FINAL CORRIGIDA)
 * - Dedup de anomalias com silenciamento progressivo
 * - Filtro de falsos positivos aprimorado
 * - 14 cenários carregados dinamicamente
 * - Interface responsiva com stats em tempo real
 */

import { GC, GCOracle } from './mod_gc.js';
import { Executor } from './mod_executor.js';
import { Groomer } from './mod_groomer.js';
import { Telemetry } from './mod_telemetry.js';
import { Scenarios, ScenarioInfo } from './mod_scenarios.js';

const State = {
    isRunning: false,
    testCount: 0,
    anomalyCount: 0,
    uniqueAnomalyCount: 0,
    gcEvents: 0,
    selectedScenarios: new Set(),
    fpsInterval: null,
    testTimes: [],
    scenarioResults: {},
    anomalyCache: new Map(),
    anomalyThreshold: 5,
    startTime: null,
    pausedScenarios: new Set(),
    
    /**
     * Inicializa a aplicação
     */
    async init() {
        console.log('%c🚀 PS4 WebKit Fuzzer v13.0 Initializing...', 'color: #00ff00; font-size: 16px;');
        
        // Inicializa GCOracle
        if (typeof GCOracle.init === 'function') {
            const gcActive = GCOracle.init();
            console.log(`%c  GCOracle: ${gcActive ? '✅ Active' : '⚠️ Not available'}`, 
                gcActive ? 'color: #00ff00' : 'color: #ffaa00');
        } else {
            console.warn('  GCOracle: ❌ init method not found');
        }
        
        // Detecta capacidades do ambiente
        const env = await this.detectEnvironment();
        this.updateEnvironmentDisplay(env);
        
        // Renderiza cenários
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
        
        // Log de categorias
        const categories = ScenarioInfo.getByCategory();
        for (const [cat, tests] of Object.entries(categories)) {
            const names = tests.map(t => t.name || t.id).join(', ');
            console.log(`%c   📁 ${cat}: ${names}`, 'color: #666; font-size: 10px;');
        }
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
            sharedWorker: typeof SharedWorker !== 'undefined',
            serviceWorker: typeof ServiceWorker !== 'undefined',
            messageChannel: typeof MessageChannel !== 'undefined',
            broadcastChannel: typeof BroadcastChannel !== 'undefined',
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
            ` | Heap: ${(env.memory.usedJSHeapSize/1048576).toFixed(1)}MB / ${(env.memory.jsHeapSizeLimit/1048576).toFixed(1)}MB` : '';
        
        const isPS4 = env.userAgent.includes('PlayStation');
        
        el.innerHTML = `
            <strong>${isPS4 ? '🎮 ' : ''}${env.userAgent}</strong><br>
            <span style="font-size:11px">
            Canvas: ${env.canvas ? '✅' : '❌'} | 
            WebGL: ${env.webgl ? '✅' : '❌'} | 
            WASM: ${env.wasm ? '✅' : '❌'} | 
            SAB: ${env.sharedArrayBuffer ? '✅' : '❌'} | 
            WeakRef: ${env.weakRef ? '✅' : '❌'} |
            FinReg: ${env.finalizationRegistry ? '✅' : '❌'} |
            GC: ${env.gcAvailable ? '✅' : '⚠️'} |
            Worker: ${env.worker ? '✅' : '❌'} |
            MsgChan: ${env.messageChannel ? '✅' : '❌'}
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
        
        // Ordem de categorias desejada
        const categoryOrder = ['TYPES', 'GC', 'JIT', 'WORKER', 'CANVAS', 'DOM', 'PROTO', 'TIMING', 'STORAGE', 'UNKNOWN'];
        const sortedCategories = Object.keys(categories).sort((a, b) => {
            const ia = categoryOrder.indexOf(a);
            const ib = categoryOrder.indexOf(b);
            return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
        });
        
        // Renderiza por categoria
        for (const category of sortedCategories) {
            const tests = categories[category];
            
            // Header de categoria
            const catHeader = document.createElement('div');
            catHeader.style.cssText = 'grid-column: 1 / -1; color: #888; font-size: 12px; padding: 8px 5px 3px 5px; border-bottom: 1px solid #333; margin-top: 5px;';
            catHeader.textContent = `📁 ${category} (${tests.length} teste${tests.length > 1 ? 's' : ''})`;
            grid.appendChild(catHeader);
            
            // Cards
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
        
        const riskColors = {
            'LOW': '#ffaa00',
            'MEDIUM': '#ff8800',
            'HIGH': '#ff4444',
            'CRITICAL': '#ff0000'
        };
        const riskColor = riskColors[scenario.risk] || '#888';
        
        const isPS4 = scenario.ps4Compatible !== false;
        const probeCount = Array.isArray(scenario.probe) ? scenario.probe.length : 0;
        const description = scenario.description || scenario.name || scenario.id;
        
        card.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:start;">
                <h3 style="margin:0;font-size:13px;">${(scenario.name || name).replace(/([A-Z])/g, ' $1').trim()}</h3>
                ${isPS4 ? '<span style="color:#00ff00;font-size:9px;" title="PS4 Compatible">🎮</span>' : ''}
            </div>
            <div style="color:${riskColor};font-weight:bold;font-size:10px;margin:2px 0;">⚠ ${scenario.risk}</div>
            <div style="font-size:10px;color:#888;">ID: ${scenario.id}</div>
            <div style="font-size:10px;color:#666;">Probes: ${probeCount}</div>
            <div style="font-size:10px;color:#555;margin-top:2px;line-height:1.2;">${description}</div>
            <div class="scenario-result" style="font-size:10px;margin-top:5px;display:none;padding:3px;background:#111;border-radius:3px;"></div>
            <div class="scenario-status" style="font-size:9px;margin-top:3px;color:#666;"></div>
            <label style="display:block;margin-top:8px;cursor:pointer;">
                <input type="checkbox" class="scenario-check" 
                       data-scenario="${name}" 
                       ${this.isRecommended(name) ? 'checked' : ''}>
                <span style="font-size:11px;">Enable</span>
            </label>
        `;
        
        // Clique no card
        card.addEventListener('click', (e) => {
            if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'LABEL') {
                const checkbox = card.querySelector('.scenario-check');
                if (checkbox) {
                    checkbox.checked = !checkbox.checked;
                    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
                }
            }
        });
        
        // Mudança no checkbox
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
        
        const isPS4 = navigator.userAgent.includes('PlayStation');
        
        if (isPS4) {
            const ps4Recommended = [
                'canvasPixelStealing',
                'domClobbering', 
                'prototypePollution',
                'typedarrayOob',
                'arraybufferNeutering',
                'bufferSlabOverflow',
                'gcUaf',
                'jscTypeConfusion',
                'messagechannelRace',
                'workerRaceCondition',
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
            const card = cb.closest('.scenario-card');
            if (card) card.classList.add('active');
        });
        
        document.querySelectorAll('.scenario-check:not(:checked)').forEach(cb => {
            const card = cb.closest('.scenario-card');
            if (card) card.classList.remove('active');
        });
        
        if (previousCount !== this.selectedScenarios.size) {
            console.log(`%c📋 Selected: ${this.selectedScenarios.size} scenarios`, 'color: #00ccff');
        }
        
        // Atualiza contador no botão
        const startBtn = document.getElementById('btnStartAll');
        if (startBtn && !this.isRunning) {
            startBtn.textContent = `▶ Run All (${this.selectedScenarios.size})`;
        }
    },
    
    /**
     * Configura controles
     */
    setupControls() {
        const bind = (id, event, handler) => {
            const el = document.getElementById(id);
            if (el) el.addEventListener(event, handler.bind(this));
        };
        
        bind('btnStartAll', 'click', () => this.startFuzzing(false));
        bind('btnStopAll', 'click', () => this.stopFuzzing());
        bind('btnClearLogs', 'click', () => this.clearLogs());
        bind('btnExportReport', 'click', () => this.exportReport());
        bind('btnRunSingle', 'click', () => this.startFuzzing(true));
        bind('btnSelectAll', 'click', () => this.selectAllScenarios());
        bind('btnDeselectAll', 'click', () => this.deselectAllScenarios());
        bind('btnResetStats', 'click', () => this.resetStats());
        
        // Tecla ESC = parar
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.isRunning) {
                this.stopFuzzing();
                this.log('System', '⏹ Parado via tecla ESC');
            }
        });
        
        // Tecla R = rodar quando parado
        document.addEventListener('keydown', (e) => {
            if (e.key === 'r' && !this.isRunning && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                this.startFuzzing(false);
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
     * Reseta estatísticas
     */
    resetStats() {
        if (this.isRunning) {
            this.log('UI', '⚠️ Pare o fuzzer antes de resetar stats');
            return;
        }
        this.testCount = 0;
        this.anomalyCount = 0;
        this.uniqueAnomalyCount = 0;
        this.gcEvents = 0;
        this.scenarioResults = {};
        this.anomalyCache.clear();
        this.pausedScenarios.clear();
        this.updateStats();
        this.updateScenarioCards();
        this.log('UI', '🔄 Estatísticas resetadas');
    },
    
    /**
     * Inicia fuzzing
     */
    async startFuzzing(singlePass = false) {
        if (this.isRunning) {
            this.log('Executor', '⚠️ Fuzzer já está rodando');
            return;
        }
        
        this.updateSelectedScenarios();
        
        if (this.selectedScenarios.size === 0) {
            this.log('Executor', '⚠️ Nenhum cenário selecionado! Selecione pelo menos um.');
            return;
        }
        
        this.isRunning = true;
        this.startTime = performance.now();
        
        if (!singlePass) {
            // Reset apenas se for modo contínuo
            this.anomalyCache.clear();
            this.pausedScenarios.clear();
        }
        
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
        
        // Lista por risco
        const criticalCount = scenariosToRun.filter(s => s.risk === 'CRITICAL').length;
        const highCount = scenariosToRun.filter(s => s.risk === 'HIGH').length;
        this.log('Executor', `   ⚡ CRITICAL: ${criticalCount} | 🔴 HIGH: ${highCount} | 🟡 MEDIUM/LOW: ${scenariosToRun.length - criticalCount - highCount}`);
        
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
        
        // Desabilita botão start
        const startBtn = document.getElementById('btnStartAll');
        if (startBtn) {
            startBtn.disabled = true;
            startBtn.textContent = '⏳ Running...';
        }
        
        // Atualiza status visual
        document.body.style.borderTop = '3px solid #00ff00';
        
        // Executa
        try {
            const generator = Executor.run(scenariosToRun);
            
            for await (const event of generator) {
                this.handleExecutorEvent(event);
                
                if (singlePass) {
                    if (this.uniqueAnomalyCount >= 5) {
                        this.log('Executor', '⏹ Modo single: 5 anomalias únicas encontradas, parando');
                        break;
                    }
                    if (this.testCount >= 10000) {
                        this.log('Executor', '⏹ Modo single: 10000 testes atingidos');
                        break;
                    }
                }
                
                // Yield para UI
                if (this.testCount % 50 === 0) {
                    await new Promise(r => setTimeout(r, 0));
                }
            }
        } catch (e) {
            this.log('Executor', `❌ Erro fatal: ${e.message}`);
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
        if (startBtn) {
            startBtn.disabled = false;
            startBtn.textContent = `▶ Run All (${this.selectedScenarios.size})`;
        }
        
        // Restaura visual
        document.body.style.borderTop = '3px solid transparent';
        
        if (wasRunning) {
            const elapsed = this.startTime ? ((performance.now() - this.startTime) / 1000).toFixed(1) : '?';
            
            this.log('Executor', '━━━━━━━━━━━━━━━━━━━━━━━━━━');
            this.log('Executor', `⏹ SESSÃO ENCERRADA`);
            this.log('Executor', `   Testes: ${this.testCount.toLocaleString()}`);
            this.log('Executor', `   Anomalias únicas: ${this.uniqueAnomalyCount}`);
            this.log('Executor', `   Total alarmes: ${this.anomalyCount}`);
            this.log('Executor', `   GC events: ${this.gcEvents}`);
            this.log('Executor', `   Duração: ${elapsed}s`);
            this.log('Executor', `   Cenários: ${this.selectedScenarios.size}`);
            this.log('Executor', '━━━━━━━━━━━━━━━━━━━━━━━━━━');
            
            this.updateScenarioCards();
        }
        
        this.updateStats();
    },
    
    /**
     * Processa eventos do executor
     */
    handleExecutorEvent(event) {
        switch (event.type) {
            case 'TICK':
                this.testCount = event.count;
                break;
                
            case 'STATUS':
                if (event.target && !this.scenarioResults[event.target]) {
                    this.scenarioResults[event.target] = { 
                        count: 0, 
                        anomalies: 0, 
                        uniqueAnomalies: new Set(),
                        paused: false
                    };
                }
                if (event.target) {
                    this.scenarioResults[event.target].count++;
                }
                break;
                
            case 'ANOMALY':
                this.anomalyCount++;
                
                const anomalyKey = `${event.api}_${event.reason}`;
                
                // Inicializa cache se necessário
                if (!this.anomalyCache.has(anomalyKey)) {
                    this.anomalyCache.set(anomalyKey, { 
                        count: 0, 
                        firstSeen: Date.now(),
                        paused: false,
                        scenario: event.api.split(' — ')[0]
                    });
                }
                
                const cached = this.anomalyCache.get(anomalyKey);
                cached.count++;
                
                // Primeira ocorrência = anomalia única
                if (cached.count === 1) {
                    this.uniqueAnomalyCount++;
                    
                    // Registra no cenário
                    if (event.api) {
                        const scenarioId = event.api.split(' — ')[0];
                        if (this.scenarioResults[scenarioId]) {
                            this.scenarioResults[scenarioId].anomalies++;
                            this.scenarioResults[scenarioId].uniqueAnomalies.add(anomalyKey);
                        }
                    }
                    
                    // Log completo
                    this.log('ANOMALY', `🔴 ${event.api}`, event);
                    this.log('ANOMALY', `   └─ ${event.reason}`);
                    this.flashAnomaly();
                    
                } else if (cached.count === this.anomalyThreshold) {
                    // Começa a suprimir
                    this.log('ANOMALY', `🔇 Suprimindo: ${event.api.split(' — ')[0]} (${cached.count}+ repetições)`, event);
                    
                } else if (cached.count % 50 === 0 && cached.count <= 200) {
                    // Atualização periódica (até 200)
                    this.log('ANOMALY', `🔁 ${event.api.split(' — ')[0]}: ${cached.count} repetições (suprimido)`, event);
                }
                
                // Pausa silenciosa
                if (cached.count > 100 && !cached.paused) {
                    cached.paused = true;
                    const scenarioId = cached.scenario;
                    this.pausedScenarios.add(scenarioId);
                    if (this.scenarioResults[scenarioId]) {
                        this.scenarioResults[scenarioId].paused = true;
                    }
                    this.log('Executor', `⏸ ${scenarioId}: pausado (>100 repetições) — outras categorias continuam`, event);
                }
                
                break;
                
            case 'DEBUG':
                if (event.scenario && event.error) {
                    console.debug(`[DEBUG:${event.scenario}] ${event.error}`);
                }
                break;
        }
    },
    
    /**
     * Flash visual para anomalia
     */
    flashAnomaly() {
        const originalBg = document.body.style.backgroundColor;
        const originalBorder = document.body.style.borderTopColor;
        
        document.body.style.backgroundColor = '#1a0000';
        document.body.style.borderTopColor = '#ff0000';
        
        setTimeout(() => {
            document.body.style.backgroundColor = originalBg || 'var(--bg, #0a0a0a)';
            document.body.style.borderTopColor = this.isRunning ? '#00ff00' : 'transparent';
        }, 200);
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
        setText('anomalyCount', this.uniqueAnomalyCount.toLocaleString());
        setText('gcCount', this.gcEvents);
        
        // Tempo decorrido
        if (this.isRunning && this.startTime) {
            const elapsed = ((performance.now() - this.startTime) / 1000).toFixed(0);
            setText('elapsedTime', `${elapsed}s`);
        } else if (!this.isRunning && this.testCount > 0) {
            setText('elapsedTime', 'Parado');
        }
        
        // FPS
        if (this.testTimes.length > 1) {
            const timeRange = this.testTimes[this.testTimes.length - 1] - this.testTimes[0];
            const fps = timeRange > 0 ? (1000 / timeRange * this.testTimes.length) : 0;
            setText('fpsCounter', fps.toFixed(0));
        }
        
        // Progresso
        const progressBar = document.getElementById('progressBar');
        if (progressBar && this.isRunning) {
            // Animação de progresso infinito
            const progress = (Date.now() % 3000) / 3000 * 100;
            progressBar.style.width = `${progress}%`;
        } else if (progressBar && !this.isRunning) {
            progressBar.style.width = '0%';
        }
    },
    
    /**
     * Atualiza cards com resultados
     */
    updateScenarioCards() {
        document.querySelectorAll('.scenario-card').forEach(card => {
            const name = card.dataset.scenario;
            const resultEl = card.querySelector('.scenario-result');
            const statusEl = card.querySelector('.scenario-status');
            
            if (this.scenarioResults[name]) {
                const r = this.scenarioResults[name];
                
                if (resultEl) {
                    resultEl.style.display = 'block';
                    if (r.anomalies > 0) {
                        resultEl.innerHTML = `🔴 ${r.anomalies} alarmes (${r.uniqueAnomalies?.size || r.anomalies} únicos)`;
                        resultEl.style.color = '#ff4444';
                        resultEl.style.background = '#1a0000';
                    } else if (r.count > 0) {
                        resultEl.innerHTML = `✅ ${r.count} testes limpos`;
                        resultEl.style.color = '#00ff00';
                        resultEl.style.background = '#001a00';
                    }
                }
                
                if (statusEl) {
                    if (r.paused) {
                        statusEl.textContent = '⏸ PAUSADO (repetitivo)';
                        statusEl.style.color = '#ffaa00';
                    } else if (this.isRunning && this.selectedScenarios.has(name)) {
                        statusEl.textContent = '▶ Rodando...';
                        statusEl.style.color = '#00ff00';
                    } else {
                        statusEl.textContent = '';
                    }
                }
            } else {
                if (resultEl) resultEl.style.display = 'none';
                if (statusEl) statusEl.textContent = '';
            }
        });
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
        this.uiInterval = setInterval(() => {
            this.updateStats();
            this.updateScenarioCards();
        }, 500);
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
        
        const colors = {
            'ANOMALY': '#ff4444',
            'Executor': '#00ccff',
            'System': '#00ff00',
            'Groomer': '#ffaa00',
            'UI': '#888888'
        };
        const color = colors[type] || '#888';
        
        entry.innerHTML = `
            <span style="color:#555;font-size:10px;">[${time}]</span>
            <span style="color:${color};font-weight:bold;font-size:10px;">[${type}]</span>
            <span style="font-size:11px;">${message}</span>
        `;
        
        container.appendChild(entry);
        
        // Auto-scroll
        container.scrollTop = container.scrollHeight;
        
        // Limita a 1000 entradas
        while (container.children.length > 1000) {
            container.removeChild(container.firstChild);
        }
        
        // Telemetria
        if (typeof Telemetry !== 'undefined' && Telemetry.log) {
            try {
                Telemetry.log({ type, message, data });
            } catch (e) {}
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
     * Exporta relatório detalhado
     */
    exportReport() {
        const report = {
            timestamp: new Date().toISOString(),
            fuzzerVersion: '13.0',
            environment: {
                userAgent: navigator.userAgent,
                platform: navigator.platform,
                gcAvailable: typeof gc === 'function',
                workerAvailable: typeof Worker !== 'undefined',
                sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
                weakRef: typeof WeakRef !== 'undefined',
                finalizationRegistry: typeof FinalizationRegistry !== 'undefined',
                memory: performance?.memory || null
            },
            stats: {
                totalTests: this.testCount,
                uniqueAnomalies: this.uniqueAnomalyCount,
                totalAlarms: this.anomalyCount,
                gcEvents: this.gcEvents,
                scenariosTested: this.selectedScenarios.size,
                duration: this.startTime ? ((performance.now() - this.startTime) / 1000).toFixed(1) + 's' : 'N/A'
            },
            scenarioResults: {},
            anomalyDetails: [],
            telemetry: typeof Telemetry !== 'undefined' ? Telemetry.report() : {}
        };
        
        // Detalhes de cada cenário
        for (const [name, scenario] of Object.entries(Scenarios)) {
            const results = this.scenarioResults[name] || {};
            report.scenarioResults[name] = {
                id: scenario.id,
                name: scenario.name,
                risk: scenario.risk,
                category: scenario.category,
                tested: this.selectedScenarios.has(name),
                testCount: results.count || 0,
                anomalies: results.anomalies || 0,
                uniqueAnomalies: results.uniqueAnomalies?.size || 0,
                paused: results.paused || false
            };
        }
        
        // Detalhes das anomalias únicas
        for (const [key, cached] of this.anomalyCache) {
            report.anomalyDetails.push({
                anomaly: key,
                count: cached.count,
                firstSeen: new Date(cached.firstSeen).toISOString(),
                scenario: cached.scenario
            });
        }
        
        // Ordena por contagem (mais frequentes primeiro)
        report.anomalyDetails.sort((a, b) => b.count - a.count);
        
        const jsonStr = JSON.stringify(report, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = `ps4-fuzzer-report-${Date.now()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        this.log('System', `📄 Relatório exportado (${(jsonStr.length / 1024).toFixed(1)}KB)`);
    }
};

// Inicialização
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => State.init());
} else {
    State.init();
}

// Exporta para debugging global
window.FuzzerState = State;
window.FuzzerScenarios = Scenarios;
window.FuzzerScenarioInfo = ScenarioInfo;

console.log('%c💡 Dicas:', 'color: #ffaa00;');
console.log('  window.FuzzerState — Estado completo do fuzzer');
console.log('  window.FuzzerScenarios — Todos os cenários');
console.log('  window.FuzzerScenarioInfo — Info agregada');
console.log('  ESC — Parar fuzzer | R — Iniciar fuzzer');
