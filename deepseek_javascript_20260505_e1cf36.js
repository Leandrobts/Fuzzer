/**
 * MOD_TELEMETRY.JS — Advanced Telemetry System
 * Monitoramento detalhado de mudanças de estado
 */

export const Telemetry = {
    events: [],
    snapshots: new Map(),
    
    EventTypes: {
        TRUE: '✅ TRUE',
        FALSE: '❌ FALSE',
        NULL: '⚫ NULL',
        UNDEFINED: '⚪ UNDEFINED',
        NUMBER: '🔢 NUMBER',
        STRING: '📝 STRING',
        OBJECT: '📦 OBJECT',
        FUNCTION: '⚡ FUNCTION',
        SYMBOL: '💠 SYMBOL',
        BIGINT: '🔮 BIGINT',
        ANOMALY: '🚨 ANOMALY',
        TIMING: '⏱️ TIMING',
        MEMORY: '💾 MEMORY',
        GC_EVENT: '🗑️ GC_EVENT',
        TYPE_CHANGE: '🔄 TYPE_CHANGE',
        VALUE_CHANGE: '📊 VALUE_CHANGE'
    },
    
    /**
     * Captura snapshot completo de um valor
     */
    snapshot: function(name, value) {
        const snap = {
            timestamp: performance.now(),
            name: name,
            type: typeof value,
            value: this.serializeValue(value),
            prototype: value?.constructor?.name,
            hasProto: value?.__proto__?.constructor?.name,
            isNull: value === null,
            isUndefined: value === undefined,
            isNaN: Number.isNaN(value),
            isFinite: Number.isFinite(value),
            isInteger: Number.isInteger(value),
            isSafeInteger: Number.isSafeInteger(value),
            stringLength: typeof value === 'string' ? value.length : -1,
            ownKeys: value && typeof value === 'object' ? Object.keys(value).length : -1,
            byteLength: value?.byteLength || value?.length || -1,
        };
        
        this.snapshots.set(name, snap);
        return snap;
    },
    
    /**
     * Compara dois snapshots e detecta mudanças
     */
    compare: function(name, newValue) {
        const oldSnap = this.snapshots.get(name);
        const newSnap = this.snapshot(name, newValue);
        
        if (!oldSnap) return { changed: true, reason: 'FIRST_SNAPSHOT' };
        
        const changes = {
            changed: false,
            typeChanged: oldSnap.type !== newSnap.type,
            valueChanged: JSON.stringify(oldSnap.value) !== JSON.stringify(newSnap.value),
            typeof_old: oldSnap.type,
            typeof_new: newSnap.type,
            value_old: oldSnap.value,
            value_new: newSnap.value,
            delta_ms: newSnap.timestamp - oldSnap.timestamp
        };
        
        if (changes.typeChanged || changes.valueChanged) {
            changes.changed = true;
            
            this.log({
                type: changes.typeChanged ? 'TYPE_CHANGE' : 'VALUE_CHANGE',
                ...changes
            });
        }
        
        return changes;
    },
    
    /**
     * Serializa valor para logging seguro
     */
    serializeValue: function(value) {
        if (value === null) return 'NULL';
        if (value === undefined) return 'UNDEFINED';
        if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
        if (typeof value === 'number') {
            if (isNaN(value)) return 'NaN';
            if (!isFinite(value)) return value > 0 ? 'Infinity' : '-Infinity';
            if (Number.isInteger(value) && Math.abs(value) > 1000000) {
                return `0x${BigInt(value).toString(16)}`;
            }
            return value.toString();
        }
        if (typeof value === 'string') {
            if (value.length > 50) return value.slice(0, 50) + '...';
            return value;
        }
        if (typeof value === 'symbol') return value.toString();
        if (typeof value === 'bigint') return `BigInt(${value.toString()})`;
        if (typeof value === 'function') return `function ${value.name || 'anonymous'}()`;
        if (typeof value === 'object' && value !== null) {
            return `[${value.constructor?.name || 'Object'} ${JSON.stringify(value).slice(0, 50)}...]`;
        }
        return String(value);
    },
    
    /**
     * Registra evento com timestamp de alta precisão
     */
    log: function(event) {
        const record = {
            timestamp: performance.now(),
            date: new Date().toISOString(),
            ...event,
            stack: new Error().stack?.split('\n')[2]?.trim()
        };
        
        this.events.push(record);
        
        // Mantém apenas últimos 10000 eventos
        if (this.events.length > 10000) {
            this.events.shift();
        }
        
        return record;
    },
    
    /**
     * Gera relatório de eventos por tipo
     */
    report: function() {
        const summary = {};
        
        for (const event of this.events) {
            const type = event.type || 'UNKNOWN';
            if (!summary[type]) {
                summary[type] = {
                    count: 0,
                    first: event.timestamp,
                    last: event.timestamp,
                    examples: []
                };
            }
            
            summary[type].count++;
            summary[type].last = event.timestamp;
            if (summary[type].examples.length < 3) {
                summary[type].examples.push(event);
            }
        }
        
        return {
            totalEvents: this.events.length,
            types: summary,
            timeRange: this.events.length > 0 ? {
                start: this.events[0].timestamp,
                end: this.events[this.events.length - 1].timestamp
            } : null
        };
    },
    
    /**
     * Monitor de ciclos para detectar loops infinitos
     */
    createCycleMonitor: function(threshold = 10000) {
        let count = 0;
        let lastReset = performance.now();
        
        return {
            tick: function() {
                count++;
                if (count > threshold) {
                    const elapsed = performance.now() - lastReset;
                    throw new Error(`[CYCLE_MONITOR] Possible infinite loop: ${count} iterations in ${elapsed.toFixed(2)}ms`);
                }
            },
            reset: function() {
                count = 0;
                lastReset = performance.now();
            }
        };
    }
};