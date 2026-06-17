class CSMPCompiler {
    constructor() {
        this.reset();
    }

    reset() {
        this.timers = { DELT: 0.01, FINTIM: 1.0, PRDEL: 0.1, OUTDEL: 0.1 };
        this.constants = {};
        this.integrators = []; // { stateVar, icStr, rateVar }
        this.equations = []; // { lhs, rhs, original, lineNum }
        this.printVars = [];
        this.prtpltVars = [];
        this.title = "CSMP III Simulation";
        this.label = "";
        this.method = "RKS"; // Default to RK4
        this.errors = [];
        this.warnings = [];
    }

    parse(code) {
        this.reset();
        const lines = code.split('\n');

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            if (!line || line.startsWith('*')) continue;

            // Handle continuation lines (ending with ...)
            while (line.endsWith('...') && i + 1 < lines.length) {
                line = line.substring(0, line.length - 3).trim() + " " + lines[++i].trim();
            }

            try {
                this.parseLine(line, i + 1);
            } catch(e) {
                this.errors.push({ line: i + 1, msg: e.message, text: line });
            }
        }
    }

    parseLine(line, lineNum) {
        const parts = line.split(/\s+/);
        const keyword = parts[0].toUpperCase();

        if (keyword === 'TITLE') {
            this.title = line.substring(5).trim();
            return;
        }
        if (keyword === 'LABEL') {
            this.label = line.substring(5).trim();
            return;
        }
        if (keyword === 'PRINT') {
            const vars = line.substring(5).split(',').map(v => v.trim()).filter(v => v);
            this.printVars.push(...vars);
            return;
        }
        if (keyword === 'PRTPLT') {
            const vars = line.substring(6).split(',').map(v => v.trim()).filter(v => v);
            this.prtpltVars.push(...vars);
            return;
        }
        if (keyword === 'TIMER') {
            const assignments = line.substring(5).split(',').map(s => s.trim());
            assignments.forEach(a => {
                const [k, v] = a.split('=').map(s => s.trim());
                if (k && v) this.timers[k.toUpperCase()] = parseFloat(v);
            });
            return;
        }
        if (keyword === 'METHOD') {
            this.method = parts[1] ? parts[1].toUpperCase() : 'RKS';
            return;
        }
        if (keyword === 'CONST' || keyword === 'PARAM' || keyword === 'PARAMETER' || keyword === 'INCON') {
            const assignments = line.substring(keyword.length).split(',').map(s => s.trim());
            assignments.forEach(a => {
                const [k, v] = a.split('=').map(s => s.trim());
                if (k && v) this.constants[k] = parseFloat(v);
            });
            return;
        }
        if (keyword === 'END' || keyword === 'STOP' || keyword === 'INITIAL' || keyword === 'DYNAMIC' || keyword === 'TERMINAL' || keyword === 'NOSORT' || keyword === 'SORT') {
            return;
        }

        // Structural statement: LHS = RHS
        const eqIdx = line.indexOf('=');
        if (eqIdx > 0) {
            const lhs = line.substring(0, eqIdx).trim();
            const rhs = line.substring(eqIdx + 1).trim();

            // Check if RHS is INTGRL
            const intgrlMatch = rhs.match(/^INTGRL\s*\((.*?),(.*)\)$/i);
            if (intgrlMatch) {
                this.integrators.push({
                    stateVar: lhs,
                    icStr: intgrlMatch[1].trim(),
                    rateVar: intgrlMatch[2].trim(),
                    lineNum: lineNum
                });
            } else {
                this.equations.push({
                    lhs: lhs,
                    rhs: this.sanitizeRHS(rhs),
                    original: line,
                    lineNum: lineNum
                });
            }
        } else {
            this.warnings.push({ line: lineNum, msg: `Unrecognized statement: ${line}` });
        }
    }

    sanitizeRHS(rhs) {
        let s = rhs;
        // CSMP built-in functions → JS equivalents
        s = s.replace(/\bALOG\b/gi, 'Math.log');
        s = s.replace(/\bEXP\b/gi, 'Math.exp');
        s = s.replace(/\bSIN\b/gi, 'Math.sin');
        s = s.replace(/\bCOS\b/gi, 'Math.cos');
        s = s.replace(/\bSQRT\b/gi, 'Math.sqrt');
        s = s.replace(/\bABS\b/gi, 'Math.abs');
        s = s.replace(/\bAMAX1\b/gi, 'Math.max');
        s = s.replace(/\bAMIN1\b/gi, 'Math.min');
        // STEP(P) → (TIME >= P ? 1.0 : 0.0)
        s = s.replace(/\bSTEP\s*\(\s*([^)]+)\s*\)/gi, '(TIME >= $1 ? 1.0 : 0.0)');
        // RAMP(P) → (TIME >= P ? (TIME - P) : 0.0)
        s = s.replace(/\bRAMP\s*\(\s*([^)]+)\s*\)/gi, '(TIME >= $1 ? (TIME - $1) : 0.0)');
        // LIMIT(P1, P2, X) → Math.max(P1, Math.min(P2, X))
        s = s.replace(/\bLIMIT\s*\(\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/gi, 'Math.max($1, Math.min($2, $3))');
        return s;
    }

    getVariablesInRHS(rhs) {
        const words = rhs.split(/[^a-zA-Z0-9_.]+/);
        const vars = words.filter(w => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(w) && w !== 'Math' && w !== 'TIME');
        return vars;
    }

    sortEquations() {
        let knowns = new Set(['TIME', 'DELT', 'FINTIM']);
        Object.keys(this.constants).forEach(k => knowns.add(k));
        this.integrators.forEach(i => knowns.add(i.stateVar));

        let unsorted = [...this.equations];
        let sorted = [];
        let maxIterations = unsorted.length * unsorted.length + 10;

        while (unsorted.length > 0 && maxIterations > 0) {
            let moved = false;
            for (let i = 0; i < unsorted.length; i++) {
                const eq = unsorted[i];
                const rhsVars = this.getVariablesInRHS(eq.rhs);
                const allKnown = rhsVars.every(v => knowns.has(v) || !isNaN(parseFloat(v)));
                if (allKnown) {
                    sorted.push(eq);
                    knowns.add(eq.lhs);
                    unsorted.splice(i, 1);
                    moved = true;
                    break;
                }
            }
            if (!moved) {
                unsorted.forEach(eq => {
                    this.errors.push({ line: eq.lineNum, msg: `Unsatisfied dependency for "${eq.lhs}". Check variable names.`, text: eq.original });
                });
                sorted = sorted.concat(unsorted);
                break;
            }
            maxIterations--;
        }
        this.equations = sorted;
    }

    // Build a JS function from sorted equations
    buildEvalFunction(state) {
        const allLHS = this.equations.map(e => e.lhs);
        const newVars = allLHS.filter(l => !(l in state));
        let body = `let { ${Object.keys(state).join(', ')} } = state;\n`;
        if (newVars.length > 0) body += `let ${newVars.join(', ')};\n`;
        this.equations.forEach(eq => { body += `${eq.lhs} = ${eq.rhs};\n`; });
        body += `state.TIME = TIME;\n`;
        this.equations.forEach(eq => { body += `state['${eq.lhs}'] = ${eq.lhs};\n`; });
        return new Function('state', body);
    }

    run() {
        this.sortEquations();
        if (this.errors.length > 0) return { errors: this.errors, warnings: this.warnings };

        let state = { TIME: 0.0 };
        Object.keys(this.timers).forEach(k => state[k] = this.timers[k]);
        Object.keys(this.constants).forEach(k => state[k] = this.constants[k]);

        this.integrators.forEach(intg => {
            let icVal = parseFloat(intg.icStr);
            if (isNaN(icVal) && this.constants[intg.icStr] !== undefined) icVal = this.constants[intg.icStr];
            if (isNaN(icVal)) icVal = 0.0;
            state[intg.stateVar] = icVal;
        });

        const delt = this.timers.DELT || 0.01;
        const fintim = this.timers.FINTIM || 1.0;
        const prdel = this.timers.PRDEL || delt;

        let computeStep;
        try {
            computeStep = this.buildEvalFunction(state);
        } catch(e) {
            this.errors.push({ line: 0, msg: `Code generation failed: ${e.message}` });
            return { errors: this.errors, warnings: this.warnings };
        }

        let outputData = [];
        let nextPrintTime = 0.0;
        const useRK4 = (this.method === 'RKS' || this.method === 'RK4');

        while (state.TIME <= fintim + 1e-9) {
            computeStep(state);

            if (state.TIME >= nextPrintTime - 1e-9) {
                let row = { TIME: state.TIME };
                this.printVars.forEach(v => row[v] = state[v]);
                this.prtpltVars.forEach(v => { if (!row.hasOwnProperty(v)) row[v] = state[v]; });
                outputData.push(row);
                nextPrintTime += prdel;
            }

            // Integration
            if (useRK4) {
                this.integrateRK4(state, computeStep, delt);
            } else {
                this.integrateEuler(state, delt);
            }

            state.TIME += delt;
        }

        return {
            title: this.title,
            label: this.label,
            printVars: this.printVars,
            prtpltVars: this.prtpltVars,
            data: outputData,
            timers: this.timers,
            constants: this.constants,
            errors: this.errors,
            warnings: this.warnings
        };
    }

    integrateEuler(state, delt) {
        this.integrators.forEach(intg => {
            const rate = state[intg.rateVar] || 0.0;
            state[intg.stateVar] += rate * delt;
        });
    }

    integrateRK4(state, computeStep, delt) {
        const n = this.integrators.length;
        if (n === 0) return;

        // Save original states
        const origStates = this.integrators.map(intg => state[intg.stateVar]);
        const origTime = state.TIME;

        // k1 (computeStep(state) was ALREADY called in the main run() loop prior to calling this)
        const k1 = this.integrators.map(intg => (state[intg.rateVar] || 0) * delt);

        // k2
        for (let i = 0; i < n; i++) state[this.integrators[i].stateVar] = origStates[i] + k1[i] / 2;
        state.TIME = origTime + delt / 2;
        computeStep(state);
        const k2 = this.integrators.map(intg => (state[intg.rateVar] || 0) * delt);

        // k3
        for (let i = 0; i < n; i++) state[this.integrators[i].stateVar] = origStates[i] + k2[i] / 2;
        computeStep(state);
        const k3 = this.integrators.map(intg => (state[intg.rateVar] || 0) * delt);

        // k4
        for (let i = 0; i < n; i++) state[this.integrators[i].stateVar] = origStates[i] + k3[i];
        state.TIME = origTime + delt;
        computeStep(state);
        const k4 = this.integrators.map(intg => (state[intg.rateVar] || 0) * delt);

        // Final update: y_new = y_old + (k1 + 2k2 + 2k3 + k4) / 6
        for (let i = 0; i < n; i++) {
            state[this.integrators[i].stateVar] = origStates[i] + (k1[i] + 2*k2[i] + 2*k3[i] + k4[i]) / 6;
        }
        state.TIME = origTime;
    }
}
