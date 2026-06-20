const editor = document.getElementById('code-editor');
const canvas = document.getElementById('plotCanvas');
const ctx = canvas.getContext('2d');
const consoleOut = document.getElementById('console-output');
const tooltip = document.getElementById('crosshair-tooltip');

const compiler = new CSMPCompiler();
let currentSimulationData = null; 

let files = {};
let filePaths = {};
let currentFile = null;

function log(msg, className="info-msg") {
    const div = document.createElement('div');
    div.className = className;
    div.textContent = msg;
    consoleOut.appendChild(div);
    consoleOut.scrollTop = consoleOut.scrollHeight;
}

function clearConsole() {
    consoleOut.innerHTML = `<div class="info-msg" style="color: #007acc; font-weight: bold;">🔬 CSMP III Compiler v2.0
Developed by Bishnu with ❤️</div><br><div class="info-msg">Ready. Type your simulation code and click Run.</div>`;
}

function clearCanvas() { ctx.clearRect(0, 0, canvas.width, canvas.height); }

function updateLineNumbers() {
    const lines = editor.value.split('\n').length;
    const numbersContainer = document.getElementById('line-numbers');
    numbersContainer.innerHTML = Array(lines).fill(0).map((_, i) => i + 1).join('<br>');
    syncScroll();
    
    const textLines = editor.value.substr(0, editor.selectionStart).split('\n');
    document.getElementById('status-pos').textContent = `Line: ${textLines.length}, Col: ${textLines[textLines.length - 1].length + 1}`;
}

function syncScroll() { document.getElementById('line-numbers').scrollTop = editor.scrollTop; }

function switchFile(filename) {
    if (files[filename] === undefined) files[filename] = '';
    if (currentFile) files[currentFile] = editor.value;
    currentFile = filename;
    editor.value = files[filename];
    
    document.querySelectorAll('.tab').forEach(t => {
        if(t.textContent.trim() === filename) t.classList.add('active');
        else t.classList.remove('active');
    });
    document.querySelectorAll('.tree-item.file').forEach(i => {
        if(i.textContent.includes(filename)) i.classList.add('active');
        else i.classList.remove('active');
    });
    updateLineNumbers();
}

function newFile() {
    let num = 1;
    while(files[`Untitled-${num}.csmp`] !== undefined) num++;
    let name = `Untitled-${num}.csmp`;
    files[name] = "";
    filePaths[name] = null;
    const tab = document.createElement('div'); tab.className = 'tab'; tab.textContent = name;
    tab.onclick = () => switchFile(name); document.getElementById('tabs-container').appendChild(tab);
    const side = document.createElement('div'); side.className = 'tree-item file'; side.innerHTML = '&nbsp; 📄 ' + name;
    side.onclick = () => switchFile(name); document.getElementById('file-tree').appendChild(side);
    switchFile(name);
}
async function openFile() { 
    if (window.electronAPI) {
        const result = await window.electronAPI.showOpenDialog();
        if (result) {
            files[result.name] = result.content;
            filePaths[result.name] = result.path;
            let exists = Array.from(document.querySelectorAll('.tab')).some(t => t.textContent.trim() === result.name);
            if (!exists) {
                const tab = document.createElement('div'); tab.className = 'tab'; tab.textContent = result.name;
                tab.onclick = () => switchFile(result.name); document.getElementById('tabs-container').appendChild(tab);
                const side = document.createElement('div'); side.className = 'tree-item file'; side.innerHTML = '&nbsp; 📄 ' + result.name;
                side.onclick = () => switchFile(result.name); document.getElementById('file-tree').appendChild(side);
            } else if (currentFile === result.name) {
                editor.value = result.content; // Fix upload overwrite bug
            }
            switchFile(result.name);
        }
    } else {
        document.getElementById('file-input').click(); 
    }
}
function handleFileSelect(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        files[file.name] = e.target.result;
        let exists = Array.from(document.querySelectorAll('.tab')).some(t => t.textContent.trim() === file.name);
        if (!exists) {
            const tab = document.createElement('div'); tab.className = 'tab'; tab.textContent = file.name;
            tab.onclick = () => switchFile(file.name); document.getElementById('tabs-container').appendChild(tab);
            const side = document.createElement('div'); side.className = 'tree-item file'; side.innerHTML = '&nbsp; 📄 ' + file.name;
            side.onclick = () => switchFile(file.name); document.getElementById('file-tree').appendChild(side);
        } else if (currentFile === file.name) {
            editor.value = e.target.result; // Fix upload overwrite bug
        }
        switchFile(file.name);
    };
    reader.readAsText(file); event.target.value = '';
}
async function saveFile() {
    files[currentFile] = editor.value;
    if (window.electronAPI) {
        let savePath = filePaths[currentFile];
        if (!savePath) {
            savePath = await window.electronAPI.showSaveDialog(null, currentFile);
            if (!savePath) return; // Cancelled
            filePaths[currentFile] = savePath;
        }
        await window.electronAPI.writeFile(savePath, editor.value);
        log(`Saved ${currentFile} to ${savePath}`, "success-msg");
    } else {
        const text = editor.value;
        const blob = new Blob([text], { type: 'text/plain' });
        const a = document.createElement('a'); a.download = currentFile;
        a.href = window.URL.createObjectURL(blob); a.click();
    }
}
function cutText() { editor.focus(); document.execCommand('cut'); }
function copyText() { editor.focus(); document.execCommand('copy'); }
async function pasteText() {
    try {
        const text = await navigator.clipboard.readText();
        const start = editor.selectionStart;
        editor.value = editor.value.substring(0, start) + text + editor.value.substring(editor.selectionEnd);
        editor.selectionStart = editor.selectionEnd = start + text.length;
        updateLineNumbers();
    } catch(e) { alert("Use Ctrl+V to paste."); }
}
function showAbout() { document.getElementById('about-dialog').style.display = 'flex'; }
function showSyntaxHelp() { document.getElementById('syntax-dialog').style.display = 'flex'; }
function showDonate() { document.getElementById('donate-dialog').style.display = 'flex'; }

// Run Simulation
function runSimulation() {
    clearConsole();
    log("Parsing CSMP source...", "info-msg");
    compiler.parse(editor.value);
    
    if (compiler.errors.length > 0) {
        compiler.errors.forEach(e => log(`Error Line ${e.line}: ${e.msg} -> ${e.text}`, "error-msg"));
        return;
    }
    
    log("Compiling and Sorting Equations...", "info-msg");
    const result = compiler.run();
    
    if (result.errors && result.errors.length > 0) {
        result.errors.forEach(e => log(`Error Line ${e.line}: ${e.msg}`, "error-msg"));
        return;
    }
    
    result.warnings.forEach(w => log(`Warning Line ${w.line}: ${w.msg}`, "warning-msg"));
    
    log(`Simulation Complete. Integrated using ${compiler.method} method.`, "success-msg");

    currentSimulationData = result;
    buildSliders(result.constants);
    
    if (result.prtpltVars.length > 0) drawPlot(result);
    else { clearCanvas(); log("No PRTPLT variables specified. Nothing to plot.", "warning-msg"); }
}

// Sliders
function buildSliders(constants) {
    const panel = document.getElementById('slider-panel');
    panel.innerHTML = '';
    const keys = Object.keys(constants);
    if (keys.length === 0) { panel.innerHTML = '<div class="slider-hint">No CONST or PARAM found.</div>'; return; }
    
    keys.forEach(k => {
        const val = constants[k];
        const div = document.createElement('div');
        div.className = 'slider-item';
        div.innerHTML = `
            <div class="slider-header"><span>${k}</span><span id="val-${k}">${val.toFixed(2)}</span></div>
            <input type="range" id="sl-${k}" min="${val/2}" max="${val*2}" step="${Math.abs(val/100) || 0.1}" value="${val}">
        `;
        panel.appendChild(div);
        
        document.getElementById(`sl-${k}`).addEventListener('input', (e) => {
            const v = parseFloat(e.target.value);
            document.getElementById(`val-${k}`).textContent = v.toFixed(2);
            compiler.constants[k] = v;
            const res = compiler.run();
            if(!res.errors || res.errors.length===0) {
                currentSimulationData = res;
                drawPlot(res, true); 
            }
        });
    });
}

// Plotting
let animFrame = null;

function drawPlot(result, instant = false) {
    if (animFrame) cancelAnimationFrame(animFrame);
    canvas.width = canvas.parentElement.clientWidth;
    canvas.height = canvas.parentElement.clientHeight;
    
    const data = result.data;
    if (!data || data.length === 0) return;
    const yVars = result.prtpltVars;
    if (!yVars || yVars.length === 0) return;
    
    let minX = data[0].TIME, maxX = data[data.length-1].TIME;
    let minY = data[0][yVars[0]], maxY = data[0][yVars[0]];
    
    data.forEach(d => {
        yVars.forEach(v => {
            if (d[v] < minY) minY = d[v];
            if (d[v] > maxY) maxY = d[v];
        });
    });
    if (maxX === minX) maxX += 1;
    
    const yRange = maxY - minY;
    if (yRange === 0) { maxY += 1; minY -= 1; }
    else { maxY += yRange * 0.1; minY -= yRange * 0.1; }

    const margin = 50, width = canvas.width - margin * 2, height = canvas.height - margin * 2;
    result.plotBounds = { minX, maxX, minY, maxY, margin, width, height, yVars };

    const colors = ['#007acc', '#e81123', '#10893E', '#FF8C00', '#6B5B95'];

    function drawAxes() {
        ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 1;
        for(let i=0; i<=5; i++) {
            let y = margin + (i/5)*height; ctx.beginPath(); ctx.moveTo(margin, y); ctx.lineTo(margin+width, y); ctx.stroke();
            let x = margin + (i/5)*width; ctx.beginPath(); ctx.moveTo(x, margin); ctx.lineTo(x, margin+height); ctx.stroke();
        }
        ctx.strokeStyle = '#555'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(margin, margin); ctx.lineTo(margin, margin+height); ctx.lineTo(margin+width, margin+height); ctx.stroke();
        ctx.fillStyle = '#333'; ctx.font = '12px Inter, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(result.label || `${yVars.join(', ')} vs TIME`, canvas.width/2, 20);
        ctx.fillText("TIME", canvas.width/2, margin + height + 35);
        ctx.fillText(minX.toFixed(2), margin, margin + height + 15);
        ctx.fillText(maxX.toFixed(2), margin+width, margin + height + 15);
        ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
        ctx.fillText(maxY.toFixed(2), margin-10, margin);
        ctx.fillText(minY.toFixed(2), margin-10, margin+height);
        
        // Legend
        ctx.textAlign = 'left';
        let lx = margin + width - 100;
        let ly = margin + 20;
        yVars.forEach((v, idx) => {
            ctx.fillStyle = colors[idx % colors.length];
            ctx.fillRect(lx, ly, 10, 10);
            ctx.fillStyle = '#333';
            ctx.fillText(v, lx + 15, ly + 9);
            ly += 20;
        });
    }

    const totalFrames = instant ? 1 : 60;
    let frame = 0;
    
    // Process points for all variables
    let allPts = {};
    yVars.forEach((v, idx) => {
        allPts[v] = data.map(d => ({
            x: margin + ((d.TIME - minX) / (maxX - minX)) * width,
            y: margin + height - ((d[v] - minY) / (maxY - minY)) * height,
            time: d.TIME, val: d[v], color: colors[idx % colors.length], name: v
        }));
    });
    result.points = allPts;

    function render() {
        clearCanvas(); drawAxes();
        const prog = instant ? 1.0 : Math.min(frame / totalFrames, 1.0);
        
        yVars.forEach((v, idx) => {
            const pts = allPts[v];
            const tIdx = instant ? pts.length - 1 : Math.min(Math.floor(prog * pts.length), pts.length - 1);
            if (tIdx < 0) return;
            ctx.strokeStyle = colors[idx % colors.length]; ctx.lineWidth = 2; ctx.beginPath();
            for (let i = 0; i <= tIdx; i++) { if (i === 0) ctx.moveTo(pts[i].x, pts[i].y); else ctx.lineTo(pts[i].x, pts[i].y); }
            ctx.stroke();
            if (tIdx >= 0 && tIdx < pts.length) { 
                ctx.fillStyle = colors[idx % colors.length]; 
                ctx.beginPath(); ctx.arc(pts[tIdx].x, pts[tIdx].y, 4, 0, Math.PI*2); ctx.fill(); 
            }
        });

        if (frame < totalFrames) { frame++; animFrame = requestAnimationFrame(render); }
    }
    render();
}

canvas.addEventListener('mousemove', (e) => {
    if(!currentSimulationData || !currentSimulationData.points) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const b = currentSimulationData.plotBounds;
    if (mx >= b.margin && mx <= b.margin + b.width && my >= b.margin && my <= b.margin + b.height) {
        drawPlot(currentSimulationData, true);
        
        const firstVar = b.yVars[0];
        const pts = currentSimulationData.points[firstVar];
        let closestIdx = 0;
        let minDist = Infinity;
        pts.forEach((p, i) => {
            const dist = Math.abs(p.x - mx);
            if (dist < minDist) { minDist = dist; closestIdx = i; }
        });
        
        const cx = pts[closestIdx].x;
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)'; ctx.lineWidth = 1; ctx.setLineDash([5, 5]); ctx.beginPath();
        ctx.moveTo(cx, b.margin); ctx.lineTo(cx, b.margin + b.height); ctx.stroke(); ctx.setLineDash([]);
        
        let toolText = `T=${pts[closestIdx].time.toFixed(3)}\n`;
        b.yVars.forEach(v => {
            const p = currentSimulationData.points[v][closestIdx];
            ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI*2); ctx.fill();
            toolText += `${v}=${p.val.toFixed(3)}\n`;
        });
        
        tooltip.style.display = 'block'; tooltip.style.left = (cx + 15) + 'px'; tooltip.style.top = (my - 25) + 'px';
        tooltip.innerText = toolText.trim();
    } else { tooltip.style.display = 'none'; drawPlot(currentSimulationData, true); }
});
canvas.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; if(currentSimulationData) drawPlot(currentSimulationData, true); });

window.addEventListener('keydown', e => {
    if (e.key === 'F9') { e.preventDefault(); runSimulation(); }
    if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='s') { e.preventDefault(); saveFile(); }
    if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='o') { e.preventDefault(); openFile(); }
    if ((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==='n') { e.preventDefault(); newFile(); }
});

function loadExample(type) {
    let name = type + '.csmp';
    let content = "";
    if (type === 'main') {
        content = "TITLE DIFFERENTIAL EQUATION SOLUTION\n*\n* Solving: 3x''' + 15x'' + 50x' + 200x = 10\n*\nX3DOT = (10.0 / 3.0) - (15.0/3.0)*X2DOT - (50.0/3.0)*XDOT - (200.0/3.0)*X\nX2DOT = INTGRL(0.0, X3DOT)\nXDOT = INTGRL(0.0, X2DOT)\nX = INTGRL(0.0, XDOT)\n*\nTIMER DELT = 0.005, FINTIM = 1.5, PRDEL = 0.05, OUTDEL = 0.05\nPRINT X, XDOT, X2DOT, X3DOT\nPRTPLT X\nLABEL DISPLACEMENT VS TIME\nEND\nSTOP";
    } else if (type === 'suspension') {
        content = "TITLE AUTOMOBILE SUSPENSION SYSTEM\n*\n* M X2DOT + D XDOT + K X = K F(T)\n*\nEND\nSTOP";
    }
    files[name] = content;
    filePaths[name] = null;
    let exists = Array.from(document.querySelectorAll('.tab')).some(t => t.textContent.trim() === name);
    if (!exists) {
        const tab = document.createElement('div'); tab.className = 'tab'; tab.textContent = name;
        tab.onclick = () => switchFile(name); document.getElementById('tabs-container').appendChild(tab);
        const side = document.createElement('div'); side.className = 'tree-item file'; side.innerHTML = '&nbsp; 📄 ' + name;
        side.onclick = () => switchFile(name); document.getElementById('file-tree').appendChild(side);
    }
    switchFile(name);
}

updateLineNumbers(); clearConsole();
newFile();

// Show welcome/donate modal once per user
if (!localStorage.getItem('welcomed_csmp_v2')) {
    document.getElementById('welcome-dialog').style.display = 'flex';
    localStorage.setItem('welcomed_csmp_v2', 'true');
}
