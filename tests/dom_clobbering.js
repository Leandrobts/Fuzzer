/**
 * TEST: DOM Clobbering
 * Tenta sobrescrever variáveis globais via elementos DOM
 * PS4 13.50: DOM completo disponível
 */

export const testDomClobbering = {
    id: 'DOM_CLOBBER',
    name: 'DOM Clobbering Attack',
    risk: 'MEDIUM',
    category: 'DOM',
    description: 'Tenta clobberar propriedades window via named DOM elements',
    ps4Compatible: true,
    
    setup: function() {
        this.container = document.createElement('div');
        this.container.id = 'fuzzer-clobber-container';
        this.container.style.display = 'none';
        document.body.appendChild(this.container);
        
        // Cria elementos com IDs que podem clobberar globais
        const clobberIds = [
            'constructor',
            '__proto__',
            'toString',
            'valueOf',
            'length',
            'name',
            'caller',
            'arguments',
            'call',
            'apply',
            'bind'
        ];
        
        this.clobberElements = [];
        for (const id of clobberIds) {
            const el = document.createElement('span');
            el.id = id;
            el.textContent = 'CLOBBERED';
            this.container.appendChild(el);
            this.clobberElements.push(el);
        }
        
        // Cria form com inputs nomeados (outra técnica)
        this.form = document.createElement('form');
        this.form.id = 'fuzzer-clobber-form';
        this.form.innerHTML = `
            <input name="action" value="malicious_action">
            <input name="submit" value="malicious_submit">
            <input name="method" value="POST">
        `;
        this.container.appendChild(this.form);
        
        // Salva valores originais
        this.originalConstructor = window.constructor;
        this.originalToString = window.toString;
    },
    
    probe: [
        // Probe 0: window.constructor foi clobberado?
        function(scenario) {
            return window.constructor?.toString()?.slice(0, 30);
        },
        
        // Probe 1: window.toString ainda funciona?
        function(scenario) {
            try {
                return typeof window.toString;
            } catch (e) {
                return 'CLOBBERED';
            }
        },
        
        // Probe 2: Número de elementos no container
        function(scenario) {
            return scenario.container?.children?.length ?? 0;
        },
        
        // Probe 3: Acesso via named items
        function(scenario) {
            try {
                return document.getElementById('constructor')?.textContent;
            } catch (e) {
                return 'ERROR';
            }
        },
        
        // Probe 4: Form action foi clobberado?
        function(scenario) {
            try {
                return scenario.form?.action;
            } catch (e) {
                return 'CLOBBERED_FORM';
            }
        }
    ],
    
    trigger: function() {
        // Ataque 1: Força acesso aos elementos via window[name]
        for (const id of ['constructor', 'toString', 'valueOf', 'name']) {
            try {
                const clobbered = window[id];
                if (clobbered && clobbered !== this[`original${id.charAt(0).toUpperCase() + id.slice(1)}`]) {
                    this[`clobbered_${id}`] = clobbered;
                }
            } catch (e) {
                // Pode lançar se acesso for bloqueado
            }
        }
        
        // Ataque 2: Tenta clobberar via form.elements
        try {
            if (this.form) {
                const actionInput = this.form.elements['action'];
                if (actionInput) {
                    this.clobberedFormAction = actionInput.value;
                }
            }
        } catch (e) {
            this.clobberedFormAction = null;
        }
        
        // Ataque 3: Remove e readiciona rapidamente (race condition)
        for (const el of this.clobberElements) {
            try {
                const parent = el.parentNode;
                if (parent) {
                    el.remove();
                    parent.appendChild(el);
                }
            } catch (e) {
                // DOM pode estar bloqueado
            }
        }
        
        // Ataque 4: Tenta clobberar via document.all
        try {
            this.allConstructor = document.all['constructor'];
        } catch (e) {
            this.allConstructor = null;
        }
        
        // Ataque 5: Força GC e verifica persistência
        if (typeof gc === 'function') {
            gc();
        }
    },
    
    cleanup: function() {
        this.container?.remove();
        this.form?.remove();
        this.container = null;
        this.form = null;
        this.clobberElements = null;
    },
    
    customValidator: function(baseResults, afterResults) {
        // Verifica se constructor foi clobberado
        if (afterResults[0] && afterResults[0].includes('CLOBBERED')) {
            return {
                anomaly: true,
                reason: '🏆 DOM CLOBBER: window.constructor foi sobrescrito por elemento DOM!'
            };
        }
        
        // Verifica se toString foi clobberado
        if (afterResults[1] === 'CLOBBERED') {
            return {
                anomaly: true,
                reason: '🏆 DOM CLOBBER: window.toString foi sobrescrito!'
            };
        }
        
        // Verifica se form action foi clobberado
        if (afterResults[4] === 'CLOBBERED_FORM') {
            return {
                anomaly: true,
                reason: '💥 FORM CLOBBER: ação do form foi sobrescrita via named input'
            };
        }
        
        return { anomaly: false, reason: '' };
    }
};
