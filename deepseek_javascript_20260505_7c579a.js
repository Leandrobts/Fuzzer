/**
 * MOD_SCENARIOS.JS — Modular Test Scenarios
 * Cada cenário foca em uma API/feature específica
 */

import { GC, GCOracle } from './mod_gc.js';
import { Mutator } from './mod_mutator.js';
import { Groomer } from './mod_groomer.js';
import { Telemetry } from './mod_telemetry.js';

export const Scenarios = {
    
    /**
     * Cenário 1: Canvas Pixel Stealing
     */
    canvasPixelStealing: {
        id: 'CANVAS_PIXEL_STEAL',
        risk: 'HIGH',
        
        setup: function() {
            this.canvas = document.createElement('canvas');
            this.canvas.width = 100;
            this.canvas.height = 100;
            this.ctx = this.canvas.getContext('2d');
            
            // Desenha dados sensíveis
            this.ctx.fillStyle = 'red';
            this.ctx.fillRect(0, 0, 100, 100);
            
            this.imageData = this.ctx.getImageData(0, 0, 100, 100);
        },
        
        probe: [
            function(scenario) {
                return scenario.ctx.getImageData(0, 0, 1, 1)?.data?.[0];
            },
            function(scenario) {
                return scenario.imageData?.data?.byteLength;
            },
            function(scenario) {
                return scenario.canvas.width;
            }
        ],
        
        trigger: function() {
            // Tenta acessar pixels após limpar contexto
            this.ctx.clearRect(0, 0, 100, 100);
            
            // PS4 específico: tenta criar pattern com canvas limpo
            try {
                const pattern = this.ctx.createPattern(this.canvas, 'no-repeat');
                this.ctx.fillStyle = pattern;
                this.ctx.fillRect(0, 0, 100, 100);
            } catch(e) {}
            
            // Força GC entre operações
            if (typeof gc === 'function') gc();
        },
        
        cleanup: function() {
            this.canvas = null;
            this.ctx = null;
            this.imageData = null;
        }
    },
    
    /**
     * Cenário 2: ArrayBuffer Neutering
     */
    arrayBufferNeutering: {
        id: 'ARRAYBUFFER_NEUTER',
        risk: 'CRITICAL',
        
        setup: function() {
            this.buffer = new ArrayBuffer(1024);
            this.view32 = new Uint32Array(this.buffer);
            this.view8 = new Uint8Array(this.buffer);
            
            // Preenche com padrão conhecido
            for (let i = 0; i < this.view32.length; i++) {
                this.view32[i] = 0xDEADBEEF;
            }
        },
        
        probe: [
            function(scenario) {
                return scenario.buffer?.byteLength;
            },
            function(scenario) {
                try {
                    return scenario.view32?.[0];
                } catch(e) {
                    return '💥 DETACHED_ACCESS';
                }
            },
            function(scenario) {
                return scenario.view8?.byteLength;
            }
        ],
        
        trigger: function() {
            // Tenta transferir/detach o buffer
            try {
                // PS4 pode não suportar transfer, mas tenta
                const worker = new Worker(URL.createObjectURL(
                    new Blob(['self.onmessage = (e) => { self.postMessage(e.data); }'])
                ));
                
                worker.postMessage(this.buffer, [this.buffer]);
                worker.terminate();
            } catch(e) {
                // Alternativa: tenta neutering via métodos obscuros
                try {
                    this.buffer.constructor.prototype.slice.call(this.buffer, 0, 0);
                } catch(e2) {}
            }
        },
        
        cleanup: function() {
            this.buffer = null;
            this.view32 = null;
            this.view8 = null;
        }
    },
    
    /**
     * Cenário 3: DOM Clobbering
     */
    domClobbering: {
        id: 'DOM_CLOBBER',
        risk: 'MEDIUM',
        
        setup: function() {
            this.div = document.createElement('div');
            this.div.id = 'test-clobber';
            document.body.appendChild(this.div);
            
            // Cria elementos com IDs que podem clobberar variáveis globais
            this.elements = [];
            const clobberIds = ['constructor', '__proto__', 'toString', 'length', 'name'];
            
            for (const id of clobberIds) {
                const el = document.createElement('span');
                el.id = id;
                this.div.appendChild(el);
                this.elements.push(el);
            }
        },
        
        probe: [
            function(scenario) {
                return window['constructor']?.toString();
            },
            function(scenario) {
                return document.getElementById('test-clobber')?.children?.length;
            },
            function(scenario) {
                return typeof window['toString'];
            }
        ],
        
        trigger: function() {
            // Força acesso aos elementos via named properties
            const form = document.createElement('form');
            form.innerHTML = '<input name="action" value="malicious">';
            document.body.appendChild(form);
            
            // Tenta clobberar propriedades do form
            this.form = form;
            
            // Remove e readiciona elementos rapidamente
            for (const el of this.elements) {
                el.remove();
                this.div.appendChild(el);
            }
        },
        
        cleanup: function() {
            this.div?.remove();
            this.form?.remove();
            this.elements = null;
            this.div = null;
            this.form = null;
        }
    },
    
    /**
     * Cenário 4: Type Confusion via Prototype Pollution
     */
    prototypePollution: {
        id: 'PROTO_POLLUTION',
        risk: 'HIGH',
        
        setup: function() {
            this.clean = { a: 1, b: 2 };
            this.clean2 = { x: 'hello' };
            
            // Armazena valores originais
            this.originalProto = Object.getPrototypeOf({});
            this.originalValues = {
                clean_a: this.clean.a,
                clean2_x: this.clean2.x
            };
        },
        
        probe: [
            function(scenario) {
                return scenario.clean?.a;
            },
            function(scenario) {
                return typeof scenario.clean?.a;
            },
            function(scenario) {
                return JSON.stringify(scenario.clean2);
            }
        ],
        
        trigger: function() {
            // Tenta poluir prototype via vários métodos
            const payloads = [
                { __proto__: { polluted: true } },
                { constructor: { prototype: { polluted: true } } }
            ];
            
            for (const payload of payloads) {
                try {
                    // Merge-like pollution
                    Object.assign({}, payload);
                    
                    // Spread pollution attempt
                    const merged = { ...payload };
                    
                    // JSON.parse pollution
                    JSON.parse('{"__proto__": {"polluted": true}}');
                } catch(e) {}
            }
            
            // Verifica se conseguiu poluir
            try {
                if ({}.polluted === true) {
                    Telemetry.log({
                        type: 'ANOMALY',
                        reason: 'Prototype pollution successful!'
                    });
                }
            } catch(e) {}
        },
        
        cleanup: function() {
            this.clean = null;
            this.clean2 = null;
        }
    },
    
    /**
     * Cenário 5: Worker MessageChannel Race
     */
    workerRaceCondition: {
        id: 'WORKER_RACE',
        risk: 'CRITICAL',
        
        setup: function() {
            this.channel = new MessageChannel();
            this.sharedData = new SharedArrayBuffer(1024);
            this.worker = null;
            
            if (typeof Worker !== 'undefined') {
                const code = `
                    self.onmessage = function(e) {
                        const { port, sharedData } = e.data;
                        const view = new Int32Array(sharedData);
                        
                        // Race: escreve enquanto main thread lê
                        for (let i = 0; i < 1000; i++) {
                            view[0] = i;
                        }
                        
                        port.postMessage('done');
                    };
                `;
                
                const blob = new Blob([code], { type: 'application/javascript' });
                this.worker = new Worker(URL.createObjectURL(blob));
            }
        },
        
        probe: [
            function(scenario) {
                return new Int32Array(scenario.sharedData)[0];
            },
            function(scenario) {
                return scenario.worker ? 'active' : 'inactive';
            }
        ],
        
        trigger: function() {
            if (!this.worker || !this.channel) return;
            
            const view = new Int32Array(this.sharedData);
            
            // Inicia worker que escreve no buffer
            this.worker.postMessage({
                port: this.channel.port2,
                sharedData: this.sharedData
            }, [this.channel.port2]);
            
            // Lê enquanto worker escreve (race condition)
            const readings = [];
            for (let i = 0; i < 100; i++) {
                readings.push(view[0]);
            }
            
            this.readings = readings;
        },
        
        cleanup: function() {
            this.worker?.terminate();
            this.channel = null;
            this.sharedData = null;
        }
    }
};