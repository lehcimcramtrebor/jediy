/* ========================================== */
/* 1. INITIALISATION ET VARIABLES GLOBALES    */
/* ========================================== */

const RATIOS = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0];
const DENSITY_PG = 1.036;
const DENSITY_VG = 1.261;

function getLiquidWeight(type, vol, pgRatio = 100, degree = 40) {
    if (vol <= 0) return 0;
    if (type === 'water') return vol * 1.0;
    if (type === 'alcohol') return vol * (1.0 - (degree * 0.00211)); 
    return (vol * (pgRatio / 100) * DENSITY_PG) + (vol * ((100 - pgRatio) / 100) * DENSITY_VG);
}

let state = { 
    t1: { vol_mode: 'defined', nic_mode: 'mg', aroma_mode: 'mono', multi: [] }, 
    t2: { vol_mode: 'defined', aroma_mode: 'mono', multi: [] },
    t3: { aroma_mode: 'mono', multi: [] },
    edit_compo: { multi: [] }
};
let calcExpr = ""; let pendingNewMix = false; 

const WIZ_PATH_MAIN = ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7'];
const ALL_WIZ_STEPS = ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7'];
let wizState = { step: 0, path: WIZ_PATH_MAIN, type: 't1', volMode: 'defined' };

let savedMixes = JSON.parse(localStorage.getItem('jediy_mixes') || '[]');
let savedCompos = JSON.parse(localStorage.getItem('jediy_compos') || '[]');
let currentMixCard = null;
let currentEditCompoId = null;
let groupMixes = false;
let unreadNotification = false;

/* ========================================== */
/* I.D. JEDI                                  */
/* ========================================== */
let jediIdentity = localStorage.getItem('jediIdentity') || "";

function openJediModal() { 
    closeSettingsModal(); 
    document.getElementById('jedi_identity_input').value = jediIdentity; 
    document.getElementById('jedi_identity_modal').classList.remove('hidden'); 
}
function closeJediModal() { document.getElementById('jedi_identity_modal').classList.add('hidden'); }
function saveJediIdentity() {
    jediIdentity = document.getElementById('jedi_identity_input').value.trim();
    if (jediIdentity) localStorage.setItem('jediIdentity', jediIdentity);
    else localStorage.removeItem('jediIdentity');
    closeJediModal();
    showAlert("Identité Jedi enregistrée !");
}

let startY = 0; let isSlider = false;
document.addEventListener('touchstart', e => { startY = e.touches[0].pageY; isSlider = e.target && e.target.tagName === 'INPUT' && e.target.type === 'range'; }, {passive: true});
document.addEventListener('touchmove', e => {
    if (isSlider) return; 
    let scrollableTarget = e.target.closest('.overflow-y-auto');
    if (scrollableTarget) { if (scrollableTarget.scrollTop <= 0 && e.touches[0].pageY > startY) e.preventDefault(); return; }
    if (window.scrollY === 0 && e.touches[0].pageY > startY) e.preventDefault();
}, {passive: false});

function init() {
    applyTheme();
    generateCheckboxes('t1'); generateCheckboxes('t2'); generateCheckboxes('wiz'); 
    document.getElementById('t1_aroma_pg_val').innerText = document.getElementById('t1_aroma_pg').value + '%';
    updateRatioDisp('t1'); updateRatioDisp('t2'); 
    updateAromaPreview('t1'); updateAromaPreview('t2');
    syncCompoSelects();
    triggerCalc(); 
    wizUpdateView();
    updateSettingsBadge();
}
window.onload = () => { init(); };

/* ========================================== */
/* 2. FONCTIONS UTILITAIRES DE CALCUL         */
/* ========================================== */

function getWeight(vol, pgRatio) { return getLiquidWeight('aroma', vol, pgRatio); }
function formatRatioStr(pg, labels = false) {
    let p = Math.round(pg);
    if (p === 100) return labels ? "Full PG" : "100% PG";
    if (p === 0) return labels ? "Full VG" : "100% VG";
    return labels ? `${p}PG / ${100-p}VG` : `${p}/${100-p}`;
}
function round1(num) { return Math.round(num * 10) / 10; }
function round2(num) { return Number(num).toFixed(2); }
function getTheme(prefix) { return prefix === 't1' ? 'complet' : (prefix === 't2' ? 'shortfill' : (prefix === 'boost' ? 'boost' : (prefix === 'compo' ? 'assistant' : 'manuel'))); }

function adjustVal(id, step) {
    let el = document.getElementById(id); if(!el) return;
    let val = parseFloat(el.value) || 0;
    el.value = Math.max(0, val + step);
    let prefix = id.substring(0, 2); 
    if (prefix === 't1' || prefix === 't2' || prefix === 't3') { 
        if(id === 't3_aroma_vol_multi') syncT3MultiVol(el.value);
        if(prefix !== 't3') updateAromaPreview(prefix); 
        triggerCalc(); 
    } 
    else if (prefix === 'wi') { if(['wiz_vol','wiz_aroma_avail','wiz_nic_mg','wiz_max_nic'].includes(id)) updateWizPreview(); } 
    else triggerCalc();
}

function getChecked(className) {
    let arr = []; document.querySelectorAll(`.${className}:checked`).forEach(el => arr.push(parseInt(el.value)));
    return arr.sort((a,b)=>b-a);
}

function deduplicateMixes(arr) {
    let seen = new Set();
    return arr.filter(r => {
        let basesKey = r.bases.filter(b => b.vol >= 0.1).map(b => `${b.pgRatio}-${round1(b.vol)}`).sort().join('|');
        let nicKey = r.nic > 0 ? `${r.nicRatio}-${round1(r.nic)}` : '0';
        let key = `${round1(r.aroma)}_${nicKey}_${basesKey}`;
        if(seen.has(key)) return false; seen.add(key); return true;
    });
}

function adjustBoostCount(step) {
    let el = document.getElementById('tab_boost_count'); let val = parseFloat(el.value) || 0;
    if (step > 0) val = Math.floor(val); else if (step < 0) val = Math.ceil(val);
    el.value = Math.max(0, val + step); syncBoostSimple('boosters');
}
function adjustBoostMl(step) {
    let el = document.getElementById('tab_boost_ml'); let val = parseFloat(el.value) || 0;
    el.value = Math.max(0, val + step); syncBoostSimple('ml');
}
function syncBoostSimple(source) {
    let countEl = document.getElementById('tab_boost_count'); let mlEl = document.getElementById('tab_boost_ml');
    if (source === 'boosters') mlEl.value = (parseFloat(countEl.value) || 0) * 10;
    else countEl.value = (parseFloat(mlEl.value) || 0) / 10;
    triggerCalc();
}

/* ========================================== */
/* 3. GESTION DE L'INTERFACE ET THÈMES        */
/* ========================================== */

function switchTheme(theme) { document.documentElement.dataset.theme = theme; }
const moonIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
const sunIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;

function applyTheme() {
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark'); document.getElementById('theme_toggle_btn').innerHTML = sunIcon;
        let metaTheme = document.getElementById('meta-theme-color'); if(metaTheme) metaTheme.content = '#0c0a09';
    } else {
        document.documentElement.classList.remove('dark'); document.getElementById('theme_toggle_btn').innerHTML = moonIcon;
        let metaTheme = document.getElementById('meta-theme-color'); if(metaTheme) metaTheme.content = '#f5f5f4';
    }
}
function toggleTheme() {
    if (document.documentElement.classList.contains('dark')) { document.documentElement.classList.remove('dark'); localStorage.theme = 'light'; document.getElementById('theme_toggle_btn').innerHTML = moonIcon; } 
    else { document.documentElement.classList.add('dark'); localStorage.theme = 'dark'; document.getElementById('theme_toggle_btn').innerHTML = sunIcon; }
}

function switchTab(tabId) {
    if (tabId === 'tab_boost_simple') document.documentElement.dataset.theme = 'boost';
    else if (tabId === 'tab_complet') document.documentElement.dataset.theme = 'complet';
    else if (tabId === 'tab_booster') document.documentElement.dataset.theme = 'shortfill';
    else if (tabId === 'tab_manuel') document.documentElement.dataset.theme = 'manuel';
    else if (tabId === 'tab_mes_donnees') document.documentElement.dataset.theme = 'assistant';
    else if (tabId === 'tab_assistant') {
        if (wizState.step < 2) document.documentElement.dataset.theme = 'assistant';
        else { if (wizState.type === 't1') document.documentElement.dataset.theme = 'complet'; else if (wizState.type === 't2') document.documentElement.dataset.theme = 'shortfill'; }
    }
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('button[id^="btn_tab_"]').forEach(el => {
        let baseClasses = "py-2.5 px-2 sm:px-4 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-1 sm:gap-2 ";
        if (el.id === 'btn_' + tabId) el.className = baseClasses + "bg-white dark:bg-stone-800 text-brand-600 dark:text-brand-400 shadow-md transform -translate-y-0.5 ring-1 ring-black/5 dark:ring-white/10";
        else el.className = baseClasses + "text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-800";
    });
    document.getElementById(tabId).classList.add('active');
    
    if (tabId === 'tab_mes_donnees') {
        renderMesMixes(); renderMesCompos();
    } else triggerCalc();
}

function toggleVolMode(prefix, mode) {
    state[prefix].vol_mode = mode;
    let btnDef = document.getElementById(`${prefix}_mode_vol_def`); let btnMax = document.getElementById(`${prefix}_mode_vol_max`);
    let activeClass = "flex-1 py-2 rounded-lg text-sm font-bold bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 shadow-sm transition-all";
    let inactiveClass = "flex-1 py-2 rounded-lg text-sm font-bold text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 transition-all";
    if(mode === 'defined') {
        btnDef.className = activeClass; btnMax.className = inactiveClass;
        document.getElementById(`${prefix}_vol_panel`).classList.remove('hidden'); document.getElementById(`${prefix}_aroma_avail_panel`).classList.add('hidden');
        if(document.getElementById(`${prefix}_vol_preview_container`)) {
            document.getElementById(`${prefix}_vol_preview_container`).classList.add('hidden'); document.getElementById(`${prefix}_aroma_sync_wrapper`).classList.remove('hidden'); document.getElementById(`${prefix}_aroma_sync_wrapper`).classList.add('flex');
        }
    } else {
        btnMax.className = activeClass; btnDef.className = inactiveClass;
        document.getElementById(`${prefix}_vol_panel`).classList.add('hidden'); document.getElementById(`${prefix}_aroma_avail_panel`).classList.remove('hidden');
        if(document.getElementById(`${prefix}_vol_preview_container`)) {
            document.getElementById(`${prefix}_vol_preview_container`).classList.remove('hidden'); document.getElementById(`${prefix}_aroma_sync_wrapper`).classList.add('hidden'); document.getElementById(`${prefix}_aroma_sync_wrapper`).classList.remove('flex');
        }
    }
    updateAromaPreview(prefix); triggerCalc();
}

function setNicMode(prefix, mode) {
    state[prefix].nic_mode = mode;
    let btnMg = document.getElementById(`${prefix}_nic_mode_mg_btn`); let btnBoost = document.getElementById(`${prefix}_nic_mode_boost_btn`);
    let activeClass = "flex-1 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 shadow-sm transition-all";
    let inactiveClass = "flex-1 py-1.5 rounded-lg text-xs font-bold text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 transition-all";
    if(mode === 'mg') {
        btnMg.className = activeClass; btnBoost.className = inactiveClass;
        document.getElementById(`${prefix}_nic_mg_panel`).classList.remove('hidden'); document.getElementById(`${prefix}_nic_mg_panel`).classList.add('flex');
        document.getElementById(`${prefix}_nic_boost_panel`).classList.add('hidden'); document.getElementById(`${prefix}_nic_boost_panel`).classList.remove('flex');
    } else {
        btnBoost.className = activeClass; btnMg.className = inactiveClass;
        document.getElementById(`${prefix}_nic_boost_panel`).classList.remove('hidden'); document.getElementById(`${prefix}_nic_boost_panel`).classList.add('flex');
        document.getElementById(`${prefix}_nic_mg_panel`).classList.add('hidden'); document.getElementById(`${prefix}_nic_mg_panel`).classList.remove('flex');
    }
    if(prefix === 't1') updateNicPreview('t1'); triggerCalc();
}

function toggleAdvAroma(prefix) {
    let chk = document.getElementById(`${prefix}_adv_aroma`).checked; let panel = document.getElementById(`${prefix}_aroma_pg_panel`);
    if(chk) panel.classList.remove('hidden'); else { panel.classList.add('hidden'); document.getElementById(`${prefix}_aroma_pg`).value = 0; document.getElementById(`${prefix}_aroma_pg_val`).innerText = '100% PG'; }
}

function updateNicPreview(prefix) {
    if (prefix !== 't1') return;
    let finalVol = 0;
    if(state.t1.vol_mode === 'defined') finalVol = parseFloat(document.getElementById('t1_vol').value) || 0;
    else { 
        let avail = parseFloat(document.getElementById('t1_aroma_avail').value) || 0; 
        let perc = state.t1.aroma_mode === 'multi' ? state.t1.multi.reduce((acc, v)=>acc+v.perc, 0) : (parseFloat(document.getElementById('t1_aroma_perc').value) || 0); 
        if(perc > 0) finalVol = avail / (perc / 100); 
    }
    let bStr = parseFloat(document.getElementById('t1_booster_str').value) || 20;

    if (state.t1.nic_mode === 'mg') {
        let targetMg = parseFloat(document.getElementById('t1_nic_mg').value) || 0;
        let nicVol = (finalVol * targetMg) / bStr; let boostersCount = nicVol / 10;
        document.getElementById('t1_nic_mg_preview').innerHTML = `Quantité : <span class="text-brand-600 dark:text-brand-400">${round1(nicVol)} ml</span> <span class="text-stone-400 dark:text-stone-500 font-normal">(soit ${round1(boostersCount)} booster${boostersCount > 1 ? 's' : ''})</span>`;
    } else {
        let bCount = parseFloat(document.getElementById('t1_nic_boost').value) || 0; let nicVol = bCount * 10;
        let finalMg = finalVol > 0 ? (nicVol * bStr) / finalVol : 0;
        document.getElementById('t1_nic_boost_preview').innerHTML = `Taux final : <span class="text-brand-600 dark:text-brand-400">${round1(finalMg)} mg/ml</span>`;
    }
}

function updateRatioDisp(prefix) { let sliderVal = document.getElementById(`${prefix}_ratio_pg`).value; document.getElementById(`${prefix}_ratio_disp`).innerText = formatRatioStr(100 - sliderVal, true); }

function updateAromaPreview(prefix) {
    if(prefix === 't3') return;
    let isMulti = state[prefix].aroma_mode === 'multi';
    
    let perc = 0;
    if (isMulti) {
        let globalSlider = document.getElementById(`${prefix}_multi_global_perc`);
        perc = globalSlider ? (parseFloat(globalSlider.value) || 0) : state[prefix].multi.reduce((acc, v)=>acc+v.perc, 0);
    } else {
        perc = parseFloat(document.getElementById(`${prefix}_aroma_perc`)?.value) || 0;
    }
    
    if(!isMulti && document.getElementById(`${prefix}_aroma_perc_disp`)) {
        document.getElementById(`${prefix}_aroma_perc_disp`).innerText = `${perc}%`;
    }

    if(state[prefix].vol_mode === 'max_aroma') {
        let avail = parseFloat(document.getElementById(`${prefix}_aroma_avail`).value) || 0; 
        if(perc > 0) {
            if(prefix === 't1') { let finalVol = avail / (perc / 100); document.getElementById('t1_vol_preview').innerText = `${round1(finalVol)} ml`; } 
            else if(prefix === 't2') {
                let finalVol = avail / (perc / 100); let maxNic = parseFloat(document.getElementById('t2_max_nic').value) || 0; let bStr = parseFloat(document.getElementById('t2_booster_str').value) || 20;
                let prepVol = finalVol - ((finalVol * maxNic) / bStr);
                document.getElementById('t2_vol_preview').innerText = `${round1(finalVol)} ml total`; document.getElementById('t2_vol_preview_sub').innerText = `soit ${round1(prepVol)} ml à préparer (avant boost)`;
            }
        } else {
            let pEl = document.getElementById(`${prefix}_vol_preview`); if(pEl) pEl.innerText = `Erreur %`;
        }
    } else if (state[prefix].vol_mode === 'defined' && !isMulti) {
        let syncInput = document.getElementById(`${prefix}_aroma_sync_ml`);
        if(syncInput) {
            let vol = 0;
            if(prefix === 't1') vol = parseFloat(document.getElementById('t1_vol').value) || 0;
            else if(prefix === 't2') {
                let prepVol = parseFloat(document.getElementById('t2_vol').value) || 0; let maxNic = parseFloat(document.getElementById('t2_max_nic').value) || 0; let bStr = parseFloat(document.getElementById('t2_booster_str').value) || 20;
                if(1 - maxNic/bStr > 0) vol = prepVol / (1 - maxNic/bStr);
            }
            syncInput.value = round2(vol * (perc / 100));
        }
    }
    if(prefix === 't1') updateNicPreview('t1');
}

function syncAromaFromMl(prefix) {
    if (state[prefix].aroma_mode === 'multi' || prefix === 't3') return;
    let syncInput = document.getElementById(`${prefix}_aroma_sync_ml`); let percInput = document.getElementById(`${prefix}_aroma_perc`);
    let ml = parseFloat(syncInput.value) || 0; let vol = 0;
    if(prefix === 't1') vol = parseFloat(document.getElementById('t1_vol').value) || 0;
    else if(prefix === 't2') {
        let prepVol = parseFloat(document.getElementById('t2_vol').value) || 0; let maxNic = parseFloat(document.getElementById('t2_max_nic').value) || 0; let bStr = parseFloat(document.getElementById('t2_booster_str').value) || 20;
        if(1 - maxNic/bStr > 0) vol = prepVol / (1 - maxNic/bStr);
    }
    if(vol > 0) {
        let perc = (ml / vol) * 100; let min = parseFloat(percInput.min); let max = parseFloat(percInput.max);
        if(perc < min) perc = min; if(perc > max) perc = max;
        percInput.value = perc; document.getElementById(`${prefix}_aroma_perc_disp`).innerText = `${round1(perc)}%`; triggerCalc();
    }
}

function syncT3MultiVol(val) {
    let aVol = parseFloat(val) || 0;
    let compoBreakdown = document.getElementById('t3_compo_breakdown');
    if(state.t3.aroma_mode === 'multi' && state.t3.multi.length > 0) {
        let totalPerc = state.t3.multi.reduce((acc, v)=>acc+v.perc, 0);
        if (totalPerc > 0) {
            let html = '';
            state.t3.multi.forEach(item => {
                let v_i = aVol * (item.perc / totalPerc);
                html += `<div class="bg-stone-100 dark:bg-stone-700 p-1.5 rounded text-center"><span class="block font-bold text-stone-700 dark:text-stone-200 truncate">${item.name}</span><span class="text-brand-600 dark:text-brand-400 font-black">${round1(v_i)}ml</span></div>`;
            });
            compoBreakdown.innerHTML = html;
        } else {
            compoBreakdown.innerHTML = '<div class="col-span-2 text-stone-500 text-center">Dosage de la compo à 0%</div>';
        }
    }
}

/* ========================================== */
/* 4. GESTION MULTI AROMES                    */
/* ========================================== */

function setAromaMode(prefix, mode) {
    state[prefix].aroma_mode = mode;
    let btnMono = document.getElementById(`${prefix}_aroma_mode_mono`); let btnMulti = document.getElementById(`${prefix}_aroma_mode_multi`);
    let activeClass = "flex-1 py-1.5 rounded-lg text-sm font-bold bg-brand-100 dark:bg-brand-800 text-brand-800 dark:text-brand-100 shadow-sm transition-all";
    let inactiveClass = "flex-1 py-1.5 rounded-lg text-sm font-bold text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 transition-all";
    
    if(mode === 'mono') {
        btnMono.className = activeClass; btnMulti.className = inactiveClass;
        document.getElementById(`${prefix}_aroma_mono_panel`).classList.remove('hidden'); document.getElementById(`${prefix}_aroma_multi_panel`).classList.add('hidden');
        if(prefix === 't3') document.getElementById('t3_compo_breakdown').classList.add('hidden');
    } else {
        btnMulti.className = activeClass; btnMono.className = inactiveClass;
        document.getElementById(`${prefix}_aroma_multi_panel`).classList.remove('hidden'); document.getElementById(`${prefix}_aroma_mono_panel`).classList.add('hidden');
        if(prefix === 't3') document.getElementById('t3_compo_breakdown').classList.remove('hidden');
        renderMultiList(prefix);
    }
    updateAromaPreview(prefix); triggerCalc();
}

function checkMultiAddButtons(prefix) {
    let isValid = true;
    
    state[prefix].multi.forEach(item => {
        if (item.name.trim().length < 2) isValid = false;
    });
    
    let currentTotal = state[prefix].multi.reduce((acc, v) => acc + v.perc, 0);
    if (currentTotal >= MAX_AROMA) isValid = false;
    
    let btns = document.querySelectorAll(`button[onclick^="addMultiLine('${prefix}'"]`);
    btns.forEach(btn => {
        btn.disabled = !isValid;
        if (!isValid) btn.classList.add('opacity-50', 'cursor-not-allowed');
        else btn.classList.remove('opacity-50', 'cursor-not-allowed');
    });
}

const MAX_AROMA = 40;

function addMultiLine(prefix, type) {
    let currentTotal = state[prefix].multi.reduce((acc, v) => acc + v.perc, 0);
    if (currentTotal >= MAX_AROMA) {
        showAlert(`Ajout impossible : limite de ${MAX_AROMA}% atteinte !`);
        return;
    }

    let id = Date.now() + Math.floor(Math.random() * 1000);
    let name = type === 'aroma' ? '' : (type === 'water' ? 'Eau' : 'Alcool');
    state[prefix].multi.push({ id, type, name, pg: 100, degree: 40, perc: 0 });
    renderMultiList(prefix); 
    if(prefix !== 'edit_compo') { updateAromaPreview(prefix); triggerCalc(); }
}

function removeMultiLine(prefix, id) {
    state[prefix].multi = state[prefix].multi.filter(x => x.id !== id);
    renderMultiList(prefix); 
    if(prefix !== 'edit_compo') { updateAromaPreview(prefix); triggerCalc(); }
}

function updateMulti(prefix, id, field, val) {
    let item = state[prefix].multi.find(x => x.id === id); if(!item) return;
    
    if(field === 'perc') { 
        val = parseFloat(val); if(isNaN(val) || val < 0) val = 0; 
        
        let otherTotal = state[prefix].multi.reduce((acc, v) => v.id !== id ? acc + v.perc : acc, 0);
        
        if (otherTotal + val > MAX_AROMA) {
            val = round1(MAX_AROMA - otherTotal);
            showAlert(`La concentration totale est bloquée à ${MAX_AROMA}% max.`);
        }
    }
    
    if(field === 'pg' || field === 'degree') val = parseFloat(val) || 0;
    item[field] = val;
    
    if(field === 'perc') { 
        renderMultiList(prefix); 
        if(prefix !== 'edit_compo'){ updateAromaPreview(prefix); triggerCalc(); } 
    }
    if(field === 'name') { 
        checkMultiAddButtons(prefix); 
        if(prefix !== 'edit_compo') checkCompoSave(prefix); 
    }
}

function updateMultiPerc(prefix, id, step) {
    let item = state[prefix].multi.find(x => x.id === id); if(!item) return;
    
    let targetVal = item.perc + step;
    let otherTotal = state[prefix].multi.reduce((acc, v) => v.id !== id ? acc + v.perc : acc, 0);
    
    if (otherTotal + targetVal > MAX_AROMA) {
        item.perc = round1(MAX_AROMA - otherTotal);
        showAlert(`La concentration totale est bloquée à ${MAX_AROMA}% max.`);
    } else {
        item.perc = Math.max(0, round1(targetVal));
    }

    renderMultiList(prefix); if(prefix !== 'edit_compo'){ updateAromaPreview(prefix); triggerCalc(); }
}

function updateGlobalMultiPerc(prefix, val) {
    let originalTotal = state[prefix].multi.reduce((acc, v) => acc + v.perc, 0);
    let currentVal = parseFloat(val);
    let slider = document.getElementById(`${prefix}_multi_global_perc`);
    
    // Magnétisme à +/- 0.5% autour de l'original
    if (Math.abs(currentVal - originalTotal) <= 0.5) {
        currentVal = originalTotal;
        if (slider) slider.value = currentVal;
    }
    
    let disp = document.getElementById(`${prefix}_multi_total_perc`);
    let label = document.getElementById(`${prefix}_multi_status_label`);
    
    if (disp) disp.innerText = `${round1(currentVal)}%`;
    
    if (label) {
        if (currentVal === originalTotal) {
            label.innerText = "Concentration originale";
            label.className = "text-[10px] font-bold text-center mt-2 text-stone-500 uppercase tracking-widest transition-colors";
        } else if (currentVal > originalTotal) {
            label.innerText = "Supérieure à l'original";
            label.className = "text-[10px] font-bold text-center mt-2 text-brand-600 uppercase tracking-widest transition-colors";
        } else {
            label.innerText = "Inférieure à l'original";
            label.className = "text-[10px] font-bold text-center mt-2 text-amber-500 uppercase tracking-widest transition-colors";
        }
    }
}

function renderMultiList(prefix) {
    let container = document.getElementById(`${prefix}_multi_list`); if(!container) return;
    let html = ''; let total = 0;
    state[prefix].multi.forEach(item => {
        total += item.perc;
        let selectHtml = '';
        if (item.type === 'aroma') {
            selectHtml = `<select onchange="updateMulti('${prefix}', ${item.id}, 'pg', this.value)" class="w-full bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg p-1.5 text-[10px] font-bold focus:outline-none transition-colors h-8">`;
            RATIOS.forEach(r => selectHtml += `<option value="${r}" ${item.pg === r ? 'selected' : ''}>${formatRatioStr(r, true)}</option>`);
            selectHtml += `</select>`;
        } else if (item.type === 'alcohol') {
            selectHtml = `<select onchange="updateMulti('${prefix}', ${item.id}, 'degree', this.value)" class="w-full bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-lg p-1.5 text-[10px] font-bold focus:outline-none transition-colors h-8">`;
            for(let d=10; d<=90; d++) selectHtml += `<option value="${d}" ${item.degree === d ? 'selected' : ''}>${d}°</option>`;
            selectHtml += `</select>`;
        } else if (item.type === 'water') {
            selectHtml = `<div class="text-[10px] text-stone-500 font-bold px-1 h-8 flex items-center">Densité: 1.0</div>`;
        }

        let placeholder = item.type === 'aroma' ? 'placeholder="Nommez votre arôme..."' : '';

        html += `
        <div class="flex flex-col p-3 bg-white dark:bg-stone-800 rounded-xl border border-stone-200 dark:border-stone-700 shadow-sm gap-2.5 animate-fade-in">
            <div class="w-full">
                <input type="text" value="${item.name}" ${placeholder} oninput="updateMulti('${prefix}', ${item.id}, 'name', this.value)" class="w-full bg-stone-50 dark:bg-stone-900 border border-stone-200 dark:border-stone-600 rounded-lg p-2 text-sm text-stone-800 dark:text-stone-100 font-bold focus:outline-none transition-colors">
            </div>
            
            <div class="flex items-center gap-2 w-full">
                <button onclick="removeMultiLine('${prefix}', ${item.id})" class="text-red-500 hover:text-red-700 bg-red-50 hover:bg-red-100 dark:bg-red-900/30 rounded-full w-8 h-8 shrink-0 flex items-center justify-center transition-colors">✕</button>
                
                <div class="flex-1 min-w-0">
                    ${selectHtml}
                </div>
                
                <div class="flex items-center bg-stone-50 dark:bg-stone-900 rounded-lg border border-stone-200 dark:border-stone-600 overflow-hidden w-32 h-8 shrink-0">
                    <button onclick="updateMultiPerc('${prefix}', ${item.id}, -0.1)" class="w-7 h-full shrink-0 flex items-center justify-center text-brand-600 font-black hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors text-sm">-</button>
                    
                    <div class="flex-1 relative flex items-center h-full">
                        <input type="number" step="0.1" value="${item.perc}" onchange="updateMulti('${prefix}', ${item.id}, 'perc', this.value)" class="w-full text-center bg-transparent font-bold text-xs text-stone-800 dark:text-stone-100 hide-arrows p-0 pl-1 pr-4 border-none outline-none focus:ring-0">
                        <span class="absolute right-1 text-[10px] font-bold text-stone-400 select-none pointer-events-none">%</span>
                    </div>

                    <button onclick="updateMultiPerc('${prefix}', ${item.id}, 0.1)" class="w-7 h-full shrink-0 flex items-center justify-center text-brand-600 font-black hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors text-sm">+</button>
                </div>
            </div>
        </div>`;
    });
container.innerHTML = html;
    
    let wrapper = document.getElementById(`${prefix}_multi_global_wrapper`);
    let slider = document.getElementById(`${prefix}_multi_global_perc`);
    let disp = document.getElementById(`${prefix}_multi_total_perc`);
    
    if (prefix === 't1' || prefix === 't2') {
        if (state[prefix].multi.length > 0) {
            if (wrapper) { wrapper.classList.remove('hidden'); wrapper.classList.add('flex'); }
            if (slider) {
                let oldOriginal = state[prefix].lastOriginalTotal || 0;
                let currentSliderVal = parseFloat(slider.value) || 0;
                // Le slider traque la nouvelle valeur originale s'il n'était pas altéré
                if (currentSliderVal === 0 || currentSliderVal === oldOriginal || state[prefix].resetSlider) {
                    slider.value = total;
                    state[prefix].resetSlider = false;
                }
                state[prefix].lastOriginalTotal = total;
                updateGlobalMultiPerc(prefix, slider.value);
            }
        } else {
            if (wrapper) { wrapper.classList.add('hidden'); wrapper.classList.remove('flex'); }
            if (disp) disp.innerText = `0%`;
            if (slider) slider.value = 0;
            state[prefix].lastOriginalTotal = 0;
        }
        checkCompoSave(prefix);
    } else {
        let percEl = document.getElementById(`${prefix}_multi_total_perc`);
        if(percEl) percEl.innerText = `${round1(total)}%`;
        if(prefix !== 'edit_compo') checkCompoSave(prefix);
    }
    
    if(prefix === 't3') syncT3MultiVol(document.getElementById('t3_aroma_vol_multi').value);
    
    checkMultiAddButtons(prefix);
}

function checkCompoSave(prefix) {
    let inp = document.getElementById(`${prefix}_compo_name`); let btn = document.getElementById(`${prefix}_btn_save_compo`);
    if(inp && btn) { 
        let itemsValid = state[prefix].multi.every(item => item.name.trim().length >= 2);
        btn.disabled = inp.value.trim().length < 2 || state[prefix].multi.length === 0 || !itemsValid; 
    }
}

function saveCompo(prefix) {
    let name = document.getElementById(`${prefix}_compo_name`).value.trim();
    let itemsValid = state[prefix].multi.every(item => item.name.trim().length >= 2);
    if(name.length < 2 || state[prefix].multi.length === 0 || !itemsValid) return;
    
    let existingIdx = savedCompos.findIndex(c => c.name.toLowerCase() === name.toLowerCase());
    if (existingIdx >= 0) {
        openHtmlConfirm(`Une composition nommée "${name}" existe déjà. Écraser ?`, () => {
            savedCompos.splice(existingIdx, 1);
            _doSaveCompo(name, prefix);
        });
    } else { _doSaveCompo(name, prefix); }
}

function _doSaveCompo(name, prefix) {
    savedCompos.push({ id: Date.now(), name: name, items: JSON.parse(JSON.stringify(state[prefix].multi)) });
    localStorage.setItem('jediy_compos', JSON.stringify(savedCompos));
    syncCompoSelects(); setNeedsExport(true); showAlert("Composition sauvegardée !");
}

function syncCompoSelects() {
    let options = `<option value="">-- Choisir une composition --</option>`;
    savedCompos.forEach(c => options += `<option value="${c.id}">${c.name}</option>`);
    ['t1', 't2', 't3', 'wiz'].forEach(p => {
        let sel = document.getElementById(`${p}_compo_select`);
        if(sel) { let val = sel.value; sel.innerHTML = options; sel.value = val; }
    });
    if(document.getElementById('tab_mes_donnees').classList.contains('active')) renderMesCompos();
}

function loadCompo(prefix, idStr) {
    if(!idStr) return;
    let id = parseInt(idStr); let compo = savedCompos.find(c => c.id === id);
    if(compo) {
        state[prefix].multi = JSON.parse(JSON.stringify(compo.items));
        state[prefix].multi.forEach(i => i.id = Date.now() + Math.floor(Math.random()*10000));
        let nameInp = document.getElementById(`${prefix}_compo_name`);
        if(nameInp) nameInp.value = compo.name;
        
        // Force le reset du slider au chargement d'une nouvelle compo
        state[prefix].resetSlider = true;
        
        renderMultiList(prefix); if(prefix !== 't3') updateAromaPreview(prefix); triggerCalc();
    }
}

// --- CREATION ET EDITION VIA MODALE ---

function createNewCompo() {
    currentEditCompoId = null;
    state.edit_compo.multi = [];
    document.getElementById('edit_compo_name').value = '';
    document.getElementById('compo_edit_modal').classList.remove('hidden');
    renderMultiList('edit_compo');
}

function editCompo(id) {
    currentEditCompoId = id;
    let c = savedCompos.find(x => x.id === id);
    if (!c) return;
    state.edit_compo.multi = JSON.parse(JSON.stringify(c.items));
    document.getElementById('edit_compo_name').value = c.name;
    document.getElementById('compo_edit_modal').classList.remove('hidden');
    renderMultiList('edit_compo');
}

function closeCompoEditModal() { document.getElementById('compo_edit_modal').classList.add('hidden'); currentEditCompoId = null; }

function saveEditedCompo() {
    let name = document.getElementById('edit_compo_name').value.trim();
    let itemsValid = state.edit_compo.multi.every(item => item.name.trim().length >= 2);
    
    if(name.length < 2 || state.edit_compo.multi.length === 0 || !itemsValid) { 
        showAlert("Nom de compo et ingrédients valides requis (min 2 lettres)."); 
        return; 
    }
    
    if (!currentEditCompoId) {
        let existingIdx = savedCompos.findIndex(c => c.name.toLowerCase() === name.toLowerCase());
        if (existingIdx >= 0) {
            openHtmlConfirm("Ce nom existe déjà. Écraser l'autre composition ?", () => {
                savedCompos.splice(existingIdx, 1);
                _finalizeNewCompoSave(name);
            });
        } else { _finalizeNewCompoSave(name); }
        return;
    }

    let existingIdx = savedCompos.findIndex(c => c.name.toLowerCase() === name.toLowerCase() && c.id !== currentEditCompoId);
    if (existingIdx >= 0) {
        openHtmlConfirm("Ce nom existe déjà. Écraser l'autre composition ?", () => {
            savedCompos.splice(existingIdx, 1);
            _finalizeEditCompoSave(name);
        });
    } else { _finalizeEditCompoSave(name); }
}

function _finalizeNewCompoSave(name) {
    savedCompos.push({ id: Date.now(), name: name, items: JSON.parse(JSON.stringify(state.edit_compo.multi)) });
    localStorage.setItem('jediy_compos', JSON.stringify(savedCompos));
    syncCompoSelects(); setNeedsExport(true); showAlert("Composition créée !"); closeCompoEditModal();
}

function _finalizeEditCompoSave(name) {
    let c = savedCompos.find(x => x.id === currentEditCompoId);
    if(c) { c.name = name; c.items = JSON.parse(JSON.stringify(state.edit_compo.multi)); }
    localStorage.setItem('jediy_compos', JSON.stringify(savedCompos));
    syncCompoSelects(); setNeedsExport(true); showAlert("Composition mise à jour !"); closeCompoEditModal();
}

function saveAsNewCompo() {
    let name = document.getElementById('edit_compo_name').value.trim() + " (Copie)";
    let itemsValid = state.edit_compo.multi.every(item => item.name.trim().length >= 2);
    if(state.edit_compo.multi.length === 0 || !itemsValid) { 
        showAlert("Ingrédients valides requis."); 
        return; 
    }
    savedCompos.push({ id: Date.now(), name: name, items: JSON.parse(JSON.stringify(state.edit_compo.multi)) });
    localStorage.setItem('jediy_compos', JSON.stringify(savedCompos));
    syncCompoSelects(); setNeedsExport(true); showAlert("Copie sauvegardée !"); closeCompoEditModal();
}

function openExportCompoPrompt() { document.getElementById('export_compo_prompt_modal').classList.remove('hidden'); }
function closeExportCompoPrompt() { document.getElementById('export_compo_prompt_modal').classList.add('hidden'); }

function getCompoExportData() {
    let c = savedCompos.find(x => x.id === currentEditCompoId);
    let name = c ? c.name : (document.getElementById('edit_compo_name').value.trim() || "Composition");
    let items = c ? c.items : state.edit_compo.multi;
    return { name, items };
}

function exportCompoJson() {
    let dataObj = getCompoExportData();
    let data = { is_jediy_compo: true, jedi: jediIdentity, data: { id: Date.now(), name: dataObj.name, items: dataObj.items } };
    let jsonStr = JSON.stringify(data, null, 2);
    let safeName = dataObj.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    let safeJedi = jediIdentity.replace(/[^a-z0-9]/gi, '_').toLowerCase() || "anonyme";
    let filename = `Composition_${safeName}_jediy_${safeJedi}.json`;
    fallbackDownload(jsonStr, filename);
    closeExportCompoPrompt();
}

function importCompoJson(e) {
    let file = e.target.files[0]; if(!file) return;
    let reader = new FileReader();
    reader.onload = function(ev) {
        try {
            let json = JSON.parse(ev.target.result);
            if(!json.is_jediy_compo) { openHtmlConfirm("Fichier non reconnu comme composition Je-DIY !"); return; }
            let compo = json.data;
            compo.id = Date.now(); 
            let existingIdx = savedCompos.findIndex(c => c.name.toLowerCase() === compo.name.toLowerCase());
            if (existingIdx >= 0) {
                openHtmlConfirm(`La composition "${compo.name}" existe déjà. Importer comme copie ?`, () => {
                    compo.name += " (Import)";
                    savedCompos.push(compo); localStorage.setItem('jediy_compos', JSON.stringify(savedCompos));
                    syncCompoSelects(); showAlert("Composition importée !");
                });
            } else {
                savedCompos.push(compo); localStorage.setItem('jediy_compos', JSON.stringify(savedCompos));
                syncCompoSelects(); showAlert("Composition importée !");
            }
        } catch(err) { openHtmlConfirm("Erreur de lecture du fichier JSON."); }
    };
    reader.readAsText(file); e.target.value = '';
}

function generateCompoText() {
    let data = getCompoExportData();
    let tPerc = data.items.reduce((acc, v)=>acc+v.perc, 0);
    let text = `🎨 COMPOSITION : ${data.name}\n-----------------\n`;
    text += `Concentration globale: ${round1(tPerc)}%\n\n📝 INGRÉDIENTS :\n`;
    data.items.forEach(i => {
        let details = i.type === 'aroma' ? `${i.pg}PG` : (i.type === 'alcohol' ? `${i.degree}°` : '1.0');
        let icon = i.type === 'water' ? '💧' : (i.type === 'alcohol' ? '🍷' : '✨');
        text += `${icon} ${i.name} (${i.perc}%) [${details}]\n`;
    });
    if (jediIdentity) text += `\nProposée par ${jediIdentity}\n`;
    text += `\n-----------------\nL'app Je-DIY :\nhttps://lehcimcramtrebor.github.io/jediy/`;
    return text;
}

function copyCompoText() {
    let text = generateCompoText();
    copyToClipboard(text);
    closeExportCompoPrompt();
}

function shareCompoText() {
    let text = generateCompoText();
    if (navigator.share) {
        navigator.share({ title: 'Composition Je-DIY', text: text }).catch(() => copyToClipboard(text));
    } else {
        copyToClipboard(text);
    }
    closeExportCompoPrompt();
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => showAlert("Copié !")).catch(err => console.error(err));
}

// Fonctions relais liées aux boutons HTML
function exportCompoPDF(action) { exportCompoMedia('pdf', action); }
function exportCompoPNG() { exportCompoMedia('png'); }

// Le moteur commun qui génère le HTML et gère l'export final
function exportCompoMedia(format, action = 'download') {
    let data = getCompoExportData();
    
    let wrapper = document.createElement('div');
    wrapper.id = "temp_compo_pdf_wrapper";
    wrapper.style.width = "100%";
    wrapper.style.maxWidth = "800px";
    wrapper.style.margin = "0 auto";
    wrapper.style.padding = "20px";
    wrapper.style.backgroundColor = "#ffffff";
    wrapper.style.fontFamily = "sans-serif";
    
    let tPerc = data.items.reduce((acc, v)=>acc+v.perc, 0);
    if (tPerc <= 0) tPerc = 1; 
    
    let currentSimVol = 30;
    if (typeof currentEditCompoId !== 'undefined' && currentEditCompoId) {
        let el = document.getElementById('conc_vol_' + currentEditCompoId);
        if (el && el.value) currentSimVol = parseFloat(el.value);
    }
    if (isNaN(currentSimVol) || currentSimVol <= 0) currentSimVol = 30;

    // On prépare les colonnes de volumes (les 4 standards + le personnalisé si différent)
    let vols = [10, 30, 50, 100];
    if (!vols.includes(currentSimVol)) vols.push(currentSimVol);
    // On trie pour avoir un tableau logique du plus petit au plus grand volume
    vols.sort((a, b) => a - b);

    let html = `
    <div style="border: 2px solid #e5e7eb; border-radius: 16px; padding: 24px; background-color: #ffffff; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);">
        
        <div style="margin-bottom: 20px; border-bottom: 1px solid #e5e7eb; padding-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-start;">
            <div style="flex: 1; padding-right: 16px;">
                <div style="font-size: 24px; font-weight: 900; color: #1c1917; line-height: 1.2; margin-bottom: 6px;">${data.name}</div>
                <span style="display: inline-block; background-color: #f5f5f4; padding: 4px 8px; border-radius: 4px; font-weight: bold; color: #78716c; text-transform: uppercase; font-size: 9px; letter-spacing: 1px;">Je-DIY • Fiche Recette Concentré</span>
            </div>
            <div style="display: flex; gap: 12px; align-items: center;">
                <div style="text-align: right;">
					<span style="display: block; font-size: 9px; font-weight: bold; color: #a8a29e; text-transform: uppercase; margin-bottom: 2px; letter-spacing: 0.5px;">Dosage préconisé en 50/50</span>
					<span style="display: inline-block; background-color: #fef3c7; padding: 4px 10px; border-radius: 8px; color: #d97706; font-weight: 900; font-size: 15px; border: 1px solid #fde68a;">${round1(tPerc)} %</span>
				</div>
                <div style="width: 48px; height: 48px; background-color: #f5f5f4; border-radius: 12px; display: flex; justify-content: center; align-items: center; font-size: 20px; border: 1px solid #e5e7eb;">🧪</div>
            </div>
        </div>
        
        <div style="font-size: 12px; font-weight: 900; color: #a8a29e; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px;">📊 Proportions de la recette</div>
        <div style="display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 24px;">`;
        
        data.items.forEach(i => {
            let details = i.type === 'aroma' ? `${i.pg}PG` : (i.type === 'alcohol' ? `${i.degree}°` : 'Densité 1.0');
            let icon = i.type === 'water' ? '💧' : (i.type === 'alcohol' ? '🍷' : '✨');
            html += `
            <div style="width: calc(33.333% - 6px); display: flex; flex-direction: column; align-items: center; justify-content: center; background-color: #fafaf9; padding: 8px; border-radius: 12px; border: 1px solid #e5e7eb; text-align: center; box-sizing: border-box;">
                <span style="font-weight: bold; color: #44403c; word-break: break-word; white-space: normal; width: 100%; padding: 2px 0; font-size: 11px; line-height: 1.2;">${icon} ${i.name}</span>
                <span style="display: inline-block; background-color: #e7e5e4; color: #78716c; padding: 2px 6px; border-radius: 4px; margin: 4px 0; font-weight: bold; font-size: 8px;">${details}</span>
                <span style="font-weight: 900; color: #d97706; font-size: 12px;">${i.perc}%</span>
            </div>`;
        });
        
        html += `
        </div>
        
        <div style="font-size: 12px; font-weight: 900; color: #a8a29e; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 12px;">🧪 Tableau de fabrication de concentré</div>
        <div style="background-color: #fcfcfc; padding: 12px; border-radius: 12px; border: 1px solid #e5e7eb; box-sizing: border-box; break-inside: avoid;">
            
            <div style="display: flex; background-color: #e7e5e4; padding: 8px 12px; border-radius: 8px; font-size: 10px; font-weight: 900; color: #44403c; text-transform: uppercase; margin-bottom: 8px;">
                <div style="flex: 2; text-align: left;">Ingrédients</div>`;
                
        // Ajout dynamique des colonnes de volumes dans l'en-tête
        vols.forEach(v => {
            let isCustom = v === currentSimVol && ![10, 30, 50, 100].includes(v);
            let textColor = isCustom ? 'color: #d97706;' : ''; // Mise en évidence du volume custom
            html += `<div style="flex: 1; text-align: right; ${textColor}">${v} ml</div>`;
        });
        
        html += `</div>`;

        // Lignes des ingrédients
        data.items.forEach((i, idx) => {
            let icon = i.type === 'water' ? '💧' : (i.type === 'alcohol' ? '🍷' : '✨');
            let borderBottom = idx < data.items.length - 1 ? 'border-bottom: 1px solid #f5f5f4;' : '';
            
            html += `
            <div style="display: flex; padding: 8px 12px; align-items: center; ${borderBottom} font-size: 11px;">
                <div style="flex: 2; font-weight: bold; color: #57534e; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 8px;">${icon} ${i.name}</div>`;
                
            // Calculs pour chaque colonne
            vols.forEach(v => {
                let v_i = v * (i.perc / tPerc);
                let w_i = getLiquidWeight(i.type, v_i, i.pg, i.degree);
                html += `
                <div style="flex: 1; text-align: right; line-height: 1.2;">
<span style="font-weight: 900; color: #1c1917; display: block;">${round2(v_i)} ml</span>
<span style="font-size: 9px; font-weight: bold; color: #d97706; display: block;">${round2(w_i)} g</span>
                </div>`;
            });
            
            html += `</div>`;
        });

        html += `</div>`; // Fin du tableau

        let footerText = typeof jediIdentity !== 'undefined' && jediIdentity ? `Composition partagée par <strong style="color: #d97706;">${jediIdentity}</strong>` : `Généré avec Je-DIY - Le calculateur expert`;
        html += `
        <div style="margin-top: 24px; text-align: center; border-top: 1px solid #e5e7eb; padding-top: 12px;">
            <span style="text-transform: uppercase; letter-spacing: 1px; font-weight: bold; color: #78716c; font-size: 9px;">${footerText}</span>
        </div>
    </div>`;
    
    wrapper.innerHTML = html;
    document.body.appendChild(wrapper); 
    document.body.classList.add('exporting');
    
    window.scrollTo(0, 0);
    
    let safeName = data.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    
    setTimeout(() => {
        let html2canvasOpts = { 
            scale: 2, 
            useCORS: true, 
            backgroundColor: '#ffffff'
        };

        if (format === 'png') {
            html2canvas(wrapper, html2canvasOpts).then(canvas => {
                let link = document.createElement('a');
                link.download = `Compo_${safeName}.png`;
                link.href = canvas.toDataURL('image/png');
                link.click();
                document.body.classList.remove('exporting');
                wrapper.remove();
                closeExportCompoPrompt();
            });
        } else {
            let opt = { 
                margin: 5, 
                filename: `Compo_${safeName}.pdf`, 
                image: { type: 'jpeg', quality: 0.98 }, 
                html2canvas: html2canvasOpts, 
                jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' } 
            };
            
            let worker = html2pdf().set(opt).from(wrapper);
            
            if (action === 'download') {
                worker.save().then(() => { 
                    document.body.classList.remove('exporting');
                    wrapper.remove(); 
                    closeExportCompoPrompt(); 
                });
            } else {
                worker.output('blob').then(pdfBlob => {
                    document.body.classList.remove('exporting');
                    wrapper.remove();
                    closeExportCompoPrompt();
                    
                    let file = new File([pdfBlob], `Compo_${safeName}.pdf`, { type: 'application/pdf' });
                    if (navigator.canShare && navigator.canShare({ files: [file] })) { 
                        navigator.share({ files: [file], title: data.name, text: 'Ma compo Je-DIY' })
                        .catch(()=>{ 
                            let link = document.createElement('a');
                            link.href = URL.createObjectURL(pdfBlob);
                            link.download = `Compo_${safeName}.pdf`;
                            link.click();
                        }); 
                    } else { 
                        let link = document.createElement('a');
                        link.href = URL.createObjectURL(pdfBlob);
                        link.download = `Compo_${safeName}.pdf`;
                        link.click();
                    }
                });
            }
        }
    }, 600);
}


/* ========================================== */
/* 6. MODE ASSISTANT (WIZARD)                 */
/* ========================================== */

function toggleWizCompo() {
    let use = document.getElementById('wiz_use_compo').checked;
    document.getElementById('wiz_compo_select').classList.toggle('hidden', !use);
    document.getElementById('wiz_aroma_perc_container').classList.toggle('hidden', use);
    document.getElementById('wiz_adv_aroma_container').classList.toggle('hidden', use);
}

function wizUpdateCompo() {
    let id = parseInt(document.getElementById('wiz_compo_select').value);
    let compo = savedCompos.find(c => c.id === id);
    if (compo) {
        let total = compo.items.reduce((acc, v)=>acc+v.perc, 0);
        document.getElementById('wiz_aroma_perc_disp').innerText = round1(total) + '% (Compo)';
    } else { document.getElementById('wiz_aroma_perc_disp').innerText = document.getElementById('wiz_aroma_perc').value + '%'; }
}

function wizUpdateView() {
    ALL_WIZ_STEPS.forEach(id => { let el = document.getElementById('wiz_' + id); if(el) { el.classList.add('hidden'); el.classList.remove('block'); } });
    if (wizState.step < 2) switchTheme('assistant'); else { if (wizState.type === 't1') switchTheme('complet'); else if (wizState.type === 't2') switchTheme('shortfill'); }
    let curStepId = wizState.path[wizState.step]; let curEl = document.getElementById('wiz_' + curStepId);
    if(curEl) { curEl.classList.remove('hidden'); curEl.classList.add('block'); }
    let progCont = document.getElementById('wiz_progress_container'); let progBar = document.getElementById('wiz_progress_bar'); let navBar = document.getElementById('wiz_nav');
    if(wizState.step === 0 || wizState.step === wizState.path.length - 1) { progCont.classList.add('hidden'); navBar.classList.add('hidden'); } 
    else { progCont.classList.remove('hidden'); navBar.classList.remove('hidden'); progBar.style.width = ((wizState.step / (wizState.path.length - 2)) * 100) + '%'; }
    document.getElementById('wiz_btn_next').innerText = (wizState.step === wizState.path.length - 2) ? "Calculer 🚀" : "Suivant";
}

function wizNext() { if(wizState.step < wizState.path.length - 1) { if(wizState.step === wizState.path.length - 2) runWizCalculation(); wizState.step++; wizUpdateView(); } }
function wizPrev() { if(wizState.step > 1) { wizState.step--; wizUpdateView(); } else if (wizState.step === 1) { wizState.step = 0; wizUpdateView(); } }
function wizRestart() { wizState.step = 0; document.getElementById('wiz_results_container').innerHTML = ''; wizUpdateView(); }

function wizSetType(type) {
    wizState.type = type; wizState.path = WIZ_PATH_MAIN;
    let percLabel = document.getElementById('wiz_aroma_perc_label'); let percHelp = document.getElementById('wiz_aroma_perc_help');
    if (type === 't1') switchTheme('complet'); else if (type === 't2') switchTheme('shortfill');
    if(type === 't1') {
        document.getElementById('wiz_nic_t1_block').classList.remove('hidden'); document.getElementById('wiz_nic_t2_block').classList.add('hidden'); document.getElementById('wiz_boosters_container').classList.remove('hidden');
        document.getElementById('wiz_nic_desc').innerText = "Règle ton taux pour ce jus.";
        if (percLabel) percLabel.innerText = "À quel pourcentage tu doses ?"; if (percHelp) percHelp.classList.add('hidden');
    } else if (type === 't2') {
        document.getElementById('wiz_nic_t1_block').classList.add('hidden'); document.getElementById('wiz_nic_t2_block').classList.remove('hidden'); document.getElementById('wiz_boosters_container').classList.add('hidden');
        document.getElementById('wiz_nic_desc').innerText = "Combien de mg/ml penses-tu ajouter max plus tard ?";
        if (percLabel) percLabel.innerText = "Dosage idéal recommandé de l'arôme ?"; if (percHelp) percHelp.classList.remove('hidden');
    }
    wizNext();
}

function wizSetVolMode(mode) {
    wizState.volMode = mode;
    if(mode === 'defined') { document.getElementById('wiz_vol_defined_block').classList.remove('hidden'); document.getElementById('wiz_vol_max_block').classList.add('hidden'); document.getElementById('wiz_vol_help').innerText = wizState.type === 't1' ? "" : "(avant ajout des boosters)"; } 
    else { document.getElementById('wiz_vol_defined_block').classList.add('hidden'); document.getElementById('wiz_vol_max_block').classList.remove('hidden'); }
    wizNext();
}

function updateWizPreview() { if(!document.getElementById('wiz_use_compo').checked) document.getElementById('wiz_aroma_perc_disp').innerText = document.getElementById('wiz_aroma_perc').value + '%'; }

function runWizCalculation() {
    let prefix = wizState.type; toggleVolMode(prefix, wizState.volMode);
    if (wizState.volMode === 'defined') document.getElementById(prefix + '_vol').value = document.getElementById('wiz_vol').value;
    else document.getElementById(prefix + '_aroma_avail').value = document.getElementById('wiz_aroma_avail').value;
    
    let useCompo = document.getElementById('wiz_use_compo').checked;
    if (useCompo) {
        let cid = document.getElementById('wiz_compo_select').value;
        if(cid) { setAromaMode(prefix, 'multi'); loadCompo(prefix, cid); }
    } else {
        setAromaMode(prefix, 'mono');
        document.getElementById(prefix + '_aroma_perc').value = document.getElementById('wiz_aroma_perc').value;
        let isAdvAroma = document.getElementById('wiz_adv_aroma').checked; let aromaPgVal = document.getElementById('wiz_aroma_pg').value;
        let tabAdvChk = document.getElementById(prefix + '_adv_aroma');
        if (tabAdvChk) {
            tabAdvChk.checked = isAdvAroma; toggleAdvAroma(prefix); 
            if (isAdvAroma) { document.getElementById(prefix + '_aroma_pg').value = aromaPgVal; document.getElementById(prefix + '_aroma_pg_val').innerText = formatRatioStr(100 - aromaPgVal, false); } 
            else { document.getElementById(prefix + '_aroma_pg').value = 0; document.getElementById(prefix + '_aroma_pg_val').innerText = '100% PG'; }
        }
    }

    document.getElementById(prefix + '_ratio_pg').value = document.getElementById('wiz_ratio_pg').value; updateRatioDisp(prefix);
    document.getElementById(prefix + '_booster_str').value = document.getElementById('wiz_booster_str').value;
    if (prefix === 't1') { setNicMode('t1', 'mg'); document.getElementById('t1_nic_mg').value = document.getElementById('wiz_nic_mg').value; } 
    else document.getElementById('t2_max_nic').value = document.getElementById('wiz_max_nic').value;

    document.querySelectorAll('.' + prefix + '_base_chk').forEach(el => { el.checked = false; toggleCheckBtn(el); });
    if (prefix === 't1') document.querySelectorAll('.t1_boost_chk').forEach(el => { el.checked = false; toggleCheckBtn(el); });

    getChecked('wiz_base_chk').forEach(val => { let el = document.querySelector(`.${prefix}_base_chk[value="${val}"]`); if(el) { el.checked = true; toggleCheckBtn(el); } });
    if (prefix === 't1') getChecked('wiz_boost_chk').forEach(val => { let el = document.querySelector(`.t1_boost_chk[value="${val}"]`); if(el) { el.checked = true; toggleCheckBtn(el); } });

    if (prefix === 't1') calcTab1(); else calcTab2();
    document.getElementById('wiz_results_container').innerHTML = document.getElementById(prefix + '_results_container').innerHTML;
    
    let header = document.getElementById('wiz_results_header');
    let container = document.getElementById('wiz_results_container');
    if(container.querySelector('.bg-red-50') || container.innerHTML.includes('Aucun Mix possible')) {
        if(header) { header.classList.add('hidden'); header.classList.remove('flex'); }
    } else if (container.innerHTML.trim() !== '') {
        if(header) { header.classList.remove('hidden'); header.classList.add('flex'); }
    }

    document.getElementById('wiz_s7_title').innerText = "Et voilà le travail ! 🎉"; document.getElementById('wiz_s7_desc').innerText = "J'ai calculé les meilleures combinaisons avec ton matériel.";
    document.getElementById('wiz_res_tab_name').innerText = prefix === 't1' ? "Liquide Complet" : "Créer Shortfill"; document.getElementById('wiz_s7_info_block').classList.remove('hidden');
}


/* ========================================== */
/* 7. MOTEUR DE CALCUL CENTRAL                */
/* ========================================== */

function triggerCalc() {
    pendingNewMix = true; 
    let activeTab = document.querySelector('.tab-content.active').id;
    if(activeTab === 'tab_complet') calcTab1();
    else if(activeTab === 'tab_booster') calcTab2();
    else if(activeTab === 'tab_manuel') calcTab3();
    else if(activeTab === 'tab_boost_simple') calcBoostSimple('tab_boost', 'tab_boost_results');
}

function findBaseMixes(targetVol, targetPgMl, basesObj) {
    let results = []; let targetRatio = targetVol > 0 ? (targetPgMl / targetVol) * 100 : 0;
    for(let basePg of basesObj) { if(Math.abs(basePg - targetRatio) < 0.1) results.push([{ pgRatio: basePg, vol: targetVol }]); }
    for(let i=0; i<basesObj.length; i++) {
        for(let j=i+1; j<basesObj.length; j++) {
            let pg1 = basesObj[i]; let pg2 = basesObj[j]; if(pg1 === pg2) continue;
            let v1 = (targetPgMl - targetVol * (pg2/100)) / ((pg1/100) - (pg2/100)); let v2 = targetVol - v1;
            if(Math.abs(v1) < 1e-5) v1 = 0; if(Math.abs(v2) < 1e-5) v2 = 0;
            if(v1 >= 0 && v2 >= 0) results.push([{ pgRatio: pg1, vol: v1 }, { pgRatio: pg2, vol: v2 }]);
        }
    }
    return results.length > 0 ? results : null;
}

function calcTab1() {
    let finalVol, aromaVol; 
    let isMulti = state.t1.aroma_mode === 'multi';
    let aromaPgVal = parseInt(document.getElementById('t1_aroma_pg').value); 
    let aromaPg = isNaN(aromaPgVal) ? 100 : (100 - aromaPgVal);
    
    let originalTotalMulti = isMulti ? state.t1.multi.reduce((acc, v) => acc + v.perc, 0) : 0;
    let p = isMulti ? (parseFloat(document.getElementById('t1_multi_global_perc').value) || originalTotalMulti) : (parseFloat(document.getElementById('t1_aroma_perc').value) || 0);
    let ratioScale = (isMulti && originalTotalMulti > 0) ? (p / originalTotalMulti) : 1;

    if(state.t1.vol_mode === 'defined') {
        finalVol = parseFloat(document.getElementById('t1_vol').value) || 0; aromaVol = finalVol * (p/100);
    } else {
        aromaVol = parseFloat(document.getElementById('t1_aroma_avail').value) || 0; 
        if(p <= 0) { renderMixes('t1', [], [{err: "Le pourcentage d'arôme doit être > 0."}]); return; }
        finalVol = aromaVol / (p/100);
    }

    if(finalVol <= 0 || aromaVol > finalVol) { renderMixes('t1', [], [{err: "Volumes incohérents."}]); return; }

    let targetPgRatio = 100 - parseInt(document.getElementById('t1_ratio_pg').value);
    let bStr = parseFloat(document.getElementById('t1_booster_str').value) || 20;
    
    let nicVol = 0;
    if(state.t1.nic_mode === 'mg') { let mg = parseFloat(document.getElementById('t1_nic_mg').value) || 0; nicVol = (finalVol * mg) / bStr; } 
    else { let bCount = parseFloat(document.getElementById('t1_nic_boost').value) || 0; nicVol = bCount * 10; }

    let baseVol = finalVol - aromaVol - nicVol; if (Math.abs(baseVol) < 1e-6) baseVol = 0; 
    if(baseVol < 0) { renderMixes('t1', [], [{err: "Pas de place pour la base ! Réduisez l'arôme ou la nicotine."}]); return; }

    let basesAvail = getChecked('t1_base_chk'); let boostsAvail = getChecked('t1_boost_chk');
    if(basesAvail.length === 0 || boostsAvail.length === 0) { renderMixes('t1', [], [{err: "Cochez au moins une base et un booster."}]); return; }

    let targetPgMl = finalVol * (targetPgRatio / 100); 
    let aromaPgMl = 0;
    if (isMulti) {
        state.t1.multi.forEach(item => { if (item.type === 'aroma') aromaPgMl += (finalVol * ((item.perc * ratioScale)/100)) * (item.pg/100); });
    } else { aromaPgMl = aromaVol * (aromaPg / 100); }

    let exactRecipes = []; let altRecipes = [];
    let multiData = isMulti ? JSON.parse(JSON.stringify(state.t1.multi)) : null;
    if (multiData && ratioScale !== 1) {
        multiData.forEach(m => m.perc = round1(m.perc * ratioScale));
    }
    let compoName = isMulti ? document.getElementById('t1_compo_name').value.trim() : null;
    
    let isWiz = document.getElementById('tab_assistant').classList.contains('active');
    let globalNameObj = isWiz ? document.getElementById('wiz_global_name') : document.getElementById('t1_global_name');
    let globalName = globalNameObj && globalNameObj.value.trim() !== "" ? globalNameObj.value.trim() : null;

    for(let bPg of boostsAvail) {
        let boostPgMl = nicVol * (bPg / 100); let remainingPgNeeded = targetPgMl - aromaPgMl - boostPgMl;
        let mixes = findBaseMixes(baseVol, remainingPgNeeded, basesAvail);
        
        if(mixes) { for(let mix of mixes) exactRecipes.push({ aroma: aromaVol, aromaPg: aromaPg, nic: nicVol, nicRatio: bPg, bases: mix, finalVol: finalVol, realPgRatio: targetPgRatio, bStr, multi: multiData, compoName, globalName, originalCompoTotal: originalTotalMulti }); } 
        else {
            let bestBase = basesAvail[0]; let minDiff = 9999;
            for(let bp of basesAvail) { let testPg = aromaPgMl + boostPgMl + (baseVol * (bp/100)); let diff = Math.abs(testPg - targetPgMl); if(diff < minDiff) { minDiff = diff; bestBase = bp; } }
            let realPg = ((aromaPgMl + boostPgMl + (baseVol * (bestBase/100))) / finalVol) * 100;
            altRecipes.push({ aroma: aromaVol, aromaPg: aromaPg, nic: nicVol, nicRatio: bPg, bases: [{pgRatio: bestBase, vol: baseVol}], finalVol: finalVol, realPgRatio: realPg, isAlt: true, bStr, multi: multiData, compoName, globalName, originalCompoTotal: originalTotalMulti });
        }
    }
    renderMixes('t1', deduplicateMixes(exactRecipes), deduplicateMixes(altRecipes).sort((a,b) => Math.abs(a.realPgRatio - targetPgRatio) - Math.abs(b.realPgRatio - targetPgRatio)));
}

function calcTab2() {
    let finalVolAfterBoost, prepVol, aromaVol;
    let isMulti = state.t2.aroma_mode === 'multi';
    
    let originalTotalMulti = isMulti ? state.t2.multi.reduce((acc, v) => acc + v.perc, 0) : 0;
    let targetAromaPerc = isMulti ? (parseFloat(document.getElementById('t2_multi_global_perc').value) || originalTotalMulti) : (parseFloat(document.getElementById('t2_aroma_perc').value) || 15);
    let ratioScale = (isMulti && originalTotalMulti > 0) ? (targetAromaPerc / originalTotalMulti) : 1;
    
    let maxNic = parseFloat(document.getElementById('t2_max_nic').value) || 0;
    let bStr = parseFloat(document.getElementById('t2_booster_str').value) || 20;

    if(state.t2.vol_mode === 'defined') {
        prepVol = parseFloat(document.getElementById('t2_vol').value) || 0;
        if(1 - maxNic/bStr <= 0) { renderMixes('t2', [], [{err: "Taux max nicotine impossible."}]); return; }
        finalVolAfterBoost = prepVol / (1 - maxNic/bStr); aromaVol = finalVolAfterBoost * (targetAromaPerc / 100);
    } else {
        aromaVol = parseFloat(document.getElementById('t2_aroma_avail').value) || 0;
        if(targetAromaPerc <= 0) { renderMixes('t2', [], [{err: "Pourcentage d'arôme > 0 requis."}]); return; }
        finalVolAfterBoost = aromaVol / (targetAromaPerc / 100);
        let boosterMaxVol = (finalVolAfterBoost * maxNic) / bStr; prepVol = finalVolAfterBoost - boosterMaxVol;
    }

    if(prepVol <= 0 || aromaVol > prepVol) { renderMixes('t2', [], [{err: "La concentration ne laisse pas de place pour la base !"}]); return; }

    let baseVol = prepVol - aromaVol; if (Math.abs(baseVol) < 1e-6) baseVol = 0; 
    let shortfillTargetPgRatio = 100 - parseInt(document.getElementById('t2_ratio_pg').value);
    let aromaPgVal = parseInt(document.getElementById('t2_aroma_pg').value); let aromaPg = isNaN(aromaPgVal) ? 100 : (100 - aromaPgVal);
    let shortfillTargetPgMl = prepVol * (shortfillTargetPgRatio / 100); 
    
    let aromaPgMl = 0;
    if (isMulti) {
        state.t2.multi.forEach(item => { if (item.type === 'aroma') aromaPgMl += (finalVolAfterBoost * ((item.perc * ratioScale)/100)) * (item.pg/100); });
    } else { aromaPgMl = aromaVol * (aromaPg / 100); }

    let remainingPgNeededInBase = shortfillTargetPgMl - aromaPgMl;
    let basesAvail = getChecked('t2_base_chk');
    if(basesAvail.length === 0) { renderMixes('t2', [], [{err: "Cochez au moins une base."}]); return; }

    let exactRecipes = []; let altRecipes = [];
    let multiData = isMulti ? JSON.parse(JSON.stringify(state.t2.multi)) : null;
    if (multiData && ratioScale !== 1) {
        multiData.forEach(m => m.perc = round1(m.perc * ratioScale));
    }
    let compoName = isMulti ? document.getElementById('t2_compo_name').value.trim() : null;

    let isWiz = document.getElementById('tab_assistant').classList.contains('active');
    let globalNameObj = isWiz ? document.getElementById('wiz_global_name') : document.getElementById('t2_global_name');
    let globalName = globalNameObj && globalNameObj.value.trim() !== "" ? globalNameObj.value.trim() : null;

    let mixes = findBaseMixes(baseVol, remainingPgNeededInBase, basesAvail);
    if(mixes) { for(let mix of mixes) exactRecipes.push({ aroma: aromaVol, aromaPg: aromaPg, bases: mix, prepVol: prepVol, finalVol: finalVolAfterBoost, realPgRatio: shortfillTargetPgRatio, nicMax: maxNic, bStr, multi: multiData, compoName, globalName, originalCompoTotal: originalTotalMulti }); } 
    else {
        let bestBase = basesAvail[0]; let minDiff = 9999;
        for(let bp of basesAvail) { let testPg = aromaPgMl + (baseVol * (bp/100)); let diff = Math.abs(testPg - shortfillTargetPgMl); if(diff < minDiff) { minDiff = diff; bestBase = bp; } }
        let realPg = ((aromaPgMl + (baseVol * (bestBase/100))) / prepVol) * 100;
        altRecipes.push({ aroma: aromaVol, aromaPg: aromaPg, bases: [{pgRatio: bestBase, vol: baseVol}], prepVol: prepVol, finalVol: finalVolAfterBoost, realPgRatio: realPg, isAlt: true, nicMax: maxNic, bStr, multi: multiData, compoName, globalName, originalCompoTotal: originalTotalMulti });
    }
    renderMixes('t2', deduplicateMixes(exactRecipes), deduplicateMixes(altRecipes).sort((a,b) => Math.abs(a.realPgRatio - shortfillTargetPgRatio) - Math.abs(b.realPgRatio - shortfillTargetPgRatio)));
}

function calcTab3() {
    let isMulti = state.t3.aroma_mode === 'multi';
    let aVol = isMulti ? (parseFloat(document.getElementById('t3_aroma_vol_multi').value)||0) : (parseFloat(document.getElementById('t3_aroma_vol').value)||0); 
    
    let aPgVal = parseFloat(document.getElementById('t3_aroma_pg').value); 
    let aPg = isNaN(aPgVal) ? 100 : (100 - aPgVal);
    
    let aWeight = 0; let totalAromaPgMl = 0;
    
    if (isMulti) {
        if (state.t3.multi.length > 0) {
            let totalPerc = state.t3.multi.reduce((acc, v) => acc + v.perc, 0);
            if (totalPerc > 0) {
                state.t3.multi.forEach(item => {
                    let vol_i = aVol * (item.perc / totalPerc);
                    let w_i = getLiquidWeight(item.type, vol_i, item.pg, item.degree);
                    aWeight += w_i;
                    if(item.type === 'aroma') totalAromaPgMl += vol_i * (item.pg/100);
                });
                aPg = aVol > 0 ? (totalAromaPgMl / aVol) * 100 : 0;
            } else {
                aWeight = getWeight(aVol, aPg);
            }
        }
    } else {
        aWeight = getWeight(aVol, aPg);
    }

    let bVol = parseFloat(document.getElementById('t3_base_vol').value)||0; let bPgVal = parseFloat(document.getElementById('t3_base_pg').value); let bPg = isNaN(bPgVal) ? 50 : (100 - bPgVal);
    let nVol = parseFloat(document.getElementById('t3_boost_vol').value)||0; let nPgVal = parseFloat(document.getElementById('t3_boost_pg').value); let nPg = isNaN(nPgVal) ? 50 : (100 - nPgVal);
    let strVal = parseFloat(document.getElementById('t3_boost_str').value); let str = isNaN(strVal) ? 20 : strVal;

    let bWeight = getWeight(bVol, bPg); let nWeight = getWeight(nVol, nPg);
    document.getElementById('t3_aroma_w').innerText = `${round2(aWeight)} g`; document.getElementById('t3_base_w').innerText = `${round2(bWeight)} g`; document.getElementById('t3_boost_w').innerText = `${round2(nWeight)} g`;
    let tVol = aVol + bVol + nVol; let tWeight = aWeight + bWeight + nWeight;

    if(tVol === 0) { document.getElementById('t3_results').innerHTML = `<div class="animate-fade-in">Aucun volume.</div>`; return; }

    let totalPg = isMulti ? (totalAromaPgMl + (bVol*(bPg/100)) + (nVol*(nPg/100))) : ((aVol*(aPg/100)) + (bVol*(bPg/100)) + (nVol*(nPg/100)));
    let pgRatio = (totalPg / tVol) * 100; let aRatio = (aVol / tVol) * 100; let finalNic = (nVol * str) / tVol;
    
    let originalCompoTotal = isMulti ? state.t3.multi.reduce((acc, v)=>acc+v.perc, 0) : 0;
    let c = { 
        type: 't3', aVol, aPg, bVol, bPg, nVol, nPg, str, 
        multi: isMulti ? JSON.parse(JSON.stringify(state.t3.multi)) : null, 
        compoName: isMulti ? document.getElementById('t3_compo_name').value.trim() : null,
        originalCompoTotal: originalCompoTotal
    };
    let hiddenCardHtml = `<div id="t3_hidden_card" class="hidden">${buildT3CardHtml(c, false, false)}</div>`;

    document.getElementById('t3_results').innerHTML = `
        <div class="animate-fade-in">
            <div class="text-sm font-bold text-brand-600 dark:text-brand-400 uppercase tracking-wider mb-2">Volume Total : <span class="text-2xl text-stone-800 dark:text-stone-100 block">${round1(tVol)} ml <span class="text-base text-brand-600 dark:text-brand-400 font-black">(${round2(tWeight)} g)</span></span></div>
            <div class="grid grid-cols-3 gap-2 mt-4 text-left">
                <div class="bg-white dark:bg-stone-800 p-3 rounded-xl shadow-sm border border-stone-100 dark:border-stone-700 transition-colors"><span class="text-[10px] text-stone-400 block uppercase">Ratio PG/VG</span><span class="font-bold text-stone-800 dark:text-stone-200">${formatRatioStr(pgRatio)}</span></div>
                <div class="bg-white dark:bg-stone-800 p-3 rounded-xl shadow-sm border border-stone-100 dark:border-stone-700 transition-colors"><span class="text-[10px] text-stone-400 block uppercase">Dosage Arôme</span><span class="font-bold text-brand-600 dark:text-brand-400">${round1(aRatio)} %</span></div>
                <div class="bg-white dark:bg-stone-800 p-3 rounded-xl shadow-sm border border-stone-100 dark:border-stone-700 transition-colors"><span class="text-[10px] text-stone-400 block uppercase">Nicotine</span><span class="font-bold text-stone-800 dark:text-stone-200">${round1(finalNic)} mg</span></div>
            </div>
            <button onclick="openModalFromCard(document.querySelector('#t3_hidden_card .recipe-card-wrapper'))" class="mt-5 w-full py-3 bg-white dark:bg-stone-700 hover:bg-brand-50 dark:hover:bg-stone-600 text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-stone-600 rounded-xl font-bold shadow-sm transition-all flex items-center justify-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg> Voir la fiche Mix
            </button>
            ${hiddenCardHtml}
        </div>
    `;
}

function calcBoostSimple(prefix, containerId) {
    let vol = parseFloat(document.getElementById(prefix + '_vol').value) || 0; let bVol = parseFloat(document.getElementById('tab_boost_ml').value) || 0;
    let advChecked = document.getElementById(prefix + '_adv').checked;
    let pgVal = parseFloat(document.getElementById(prefix + '_pg').value); let pg = isNaN(pgVal) ? 50 : (100 - pgVal);
    let strEl = document.getElementById(prefix + '_str'); let strVal = strEl ? parseFloat(strEl.value) : 20; let bStr = isNaN(strVal) ? 20 : strVal;
    let bPgVal = parseFloat(document.getElementById(prefix + '_bpg').value); let bPg = isNaN(bPgVal) ? 50 : (100 - bPgVal);
    let finalVol = vol + bVol;
    
    if (finalVol <= 0) { document.getElementById(containerId).innerHTML = `<div class="animate-fade-in p-4 bg-stone-100 dark:bg-stone-800 text-stone-500 rounded-2xl text-center">Entre un volume ou des boosters pour voir le résultat.</div>`; return; }

    let finalNic = finalVol > 0 ? (bVol * bStr) / finalVol : 0; let ratioHtml = "";
    let jWeight = getWeight(vol, pg); let bWeight = getWeight(bVol, bPg); let totalWeight = jWeight + bWeight;

    let jWeightEl = document.getElementById('tab_boost_vol_w'); let bWeightEl = document.getElementById('tab_boost_b_w');
    if (advChecked) { if(jWeightEl) { jWeightEl.innerText = round2(jWeight) + " g"; jWeightEl.classList.remove('hidden'); } if(bWeightEl) { bWeightEl.innerText = round2(bWeight) + " g"; bWeightEl.classList.remove('hidden'); } } 
    else { if(jWeightEl) jWeightEl.classList.add('hidden'); if(bWeightEl) bWeightEl.classList.add('hidden'); }

    let finalPgRatio = 50; let btnHtml = ""; let hiddenCardHtml = "";
    if (advChecked) {
        let totalPgMl = (vol * (pg / 100)) + (bVol * (bPg / 100)); finalPgRatio = finalVol > 0 ? (totalPgMl / finalVol) * 100 : 50;
        ratioHtml = `<div class="bg-white dark:bg-stone-800 p-4 rounded-2xl shadow-sm border border-stone-100 dark:border-stone-700/50 flex flex-col justify-center text-center transition-colors"><span class="text-[10px] text-stone-500 dark:text-stone-400 font-bold uppercase tracking-wider mb-1">Ratio Final</span><span class="text-sm font-black text-brand-600 dark:text-brand-400 mt-1">${formatRatioStr(finalPgRatio, true)}</span></div>`;
        let c = { type: 'boost', vol, bVol, advChecked, pg, bPg, bStr };
        hiddenCardHtml = `<div id="t_boost_hidden_card" class="hidden">${buildBoostCardHtml(c, false, false)}</div>`;
        btnHtml = `<button onclick="openModalFromCard(document.querySelector('#t_boost_hidden_card .recipe-card-wrapper'))" class="mt-5 w-full py-3 bg-white dark:bg-stone-700 hover:bg-brand-50 dark:hover:bg-stone-600 text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-stone-600 rounded-xl font-bold shadow-sm transition-all flex items-center justify-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg> Voir la fiche Mix
        </button>`;
    }

    let visualCap = finalVol * 1.1; let hJuice = (vol / visualCap) * 100; let hBoost = (bVol / visualCap) * 100; let hAir = 100 - hJuice - hBoost;
    let weightHtmlFinal = advChecked ? `<span class="text-base text-brand-600 dark:text-brand-400 font-black block mt-1">(${round2(totalWeight)} g)</span>` : '';

    let html = `
        <div class="animate-fade-in flex flex-col md:flex-row gap-6 items-center md:items-stretch bg-brand-50 dark:bg-brand-900 p-4 rounded-3xl border border-brand-200 dark:border-brand-700 transition-colors">
            <div class="flex-shrink-0 w-32 h-56 relative flex items-end justify-center py-4">
                <div class="relative w-16 h-40 border-4 border-white dark:border-stone-600 rounded-b-2xl rounded-t-xl shadow-lg flex flex-col justify-end overflow-hidden bg-white/20 backdrop-blur-sm z-20">
                    <div style="height: ${hAir}%" class="w-full bg-transparent"></div>
                    <div style="height: ${hBoost}%" class="w-full bg-brand-400/90 dark:bg-brand-500/90 relative flex justify-center items-center">${bVol > 0 && hBoost > 10 ? `<span class="text-[9px] text-white font-black">BOOST</span>` : ''}</div>
                    <div style="height: ${hJuice}%" class="w-full bg-stone-500/90 dark:bg-stone-600/90 relative flex justify-center items-center">${vol > 0 && hJuice > 10 ? `<span class="text-[10px] text-white font-black">JUS</span>` : ''}</div>
                </div>
            </div>
            <div class="flex-1 w-full grid grid-cols-2 gap-3 py-2 content-center">
                <div class="col-span-2 bg-white dark:bg-stone-800 p-4 rounded-2xl shadow-sm border border-stone-100 dark:border-stone-700/50 flex flex-col justify-center text-center transition-colors">
                    <span class="text-xs text-stone-500 dark:text-stone-400 font-bold uppercase tracking-wider mb-1">Volume Final</span>
                    <span class="text-3xl font-black text-stone-800 dark:text-stone-100">${round1(finalVol)} ml ${weightHtmlFinal}</span>
                </div>
                <div class="bg-brand-50 dark:bg-brand-900 p-4 rounded-2xl border border-brand-100 dark:border-brand-700 flex flex-col justify-center text-center transition-colors">
                    <span class="text-[10px] text-brand-700/70 dark:text-brand-400/70 font-bold uppercase tracking-wider mb-1">Nicotine</span>
                    <span class="text-xl font-black text-brand-600 dark:text-brand-400">${round1(finalNic)} <span class="text-xs">mg</span></span>
                </div>
                ${ratioHtml}
            </div>
        </div>
        ${btnHtml}
        ${hiddenCardHtml}
    `;
    document.getElementById(containerId).innerHTML = html;
}

/* ========================================== */
/* 8. AFFICHAGE ET GÉNÉRATION HTML DES CARTES */
/* ========================================== */

function generateCheckboxes(prefix) {
    let baseContainer = document.getElementById(`${prefix}_bases_list`); let boostContainer = document.getElementById(`${prefix}_boosters_list`);
    let baseHtml = '', boostHtml = '';
    let defaultsBase = [100, 0]; let defaultsBoost = ['t1', 'wiz'].includes(prefix) ? [50] : [];

    RATIOS.forEach(pg => {
        let isBaseChecked = defaultsBase.includes(pg); let isBoostChecked = defaultsBoost.includes(pg);
        let checkIcon = `<svg class="check-icon w-5 h-5 text-emerald-500 absolute left-2 ${isBaseChecked?'':'hidden'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        let baseClasses = isBaseChecked ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-500' : 'border-stone-200 dark:border-stone-700';
        baseHtml += `<label class="relative flex items-center justify-center py-2.5 px-2 rounded-xl border-2 cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800 transition-all select-none ${baseClasses}"><input type="checkbox" class="${prefix}_base_chk hidden" value="${pg}" ${isBaseChecked?'checked':''} onchange="toggleCheckBtn(this); triggerCalc()">${checkIcon}<span class="text-xs font-black text-stone-700 dark:text-stone-300 ml-3">${formatRatioStr(pg, true)}</span></label>`;
        
        let checkIconB = `<svg class="check-icon w-5 h-5 text-emerald-500 absolute left-2 ${isBoostChecked?'':'hidden'}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        let boostClasses = isBoostChecked ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 dark:border-emerald-500' : 'border-stone-200 dark:border-stone-700';
        boostHtml += `<label class="relative flex items-center justify-center py-2.5 px-2 rounded-xl border-2 cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800 transition-all select-none ${boostClasses}"><input type="checkbox" class="${prefix}_boost_chk hidden" value="${pg}" ${isBoostChecked?'checked':''} onchange="toggleCheckBtn(this); triggerCalc()">${checkIconB}<span class="text-xs font-black text-stone-700 dark:text-stone-300 ml-3">${formatRatioStr(pg, true)}</span></label>`;
    });

    if(baseContainer) baseContainer.innerHTML = baseHtml; if(boostContainer) boostContainer.innerHTML = boostHtml;
}

function toggleCheckBtn(input) {
    let label = input.parentElement; let icon = label.querySelector('.check-icon');
    if(input.checked) {
        label.classList.remove('border-stone-200', 'dark:border-stone-700'); label.classList.add('border-emerald-500', 'bg-emerald-50', 'dark:bg-emerald-900/20', 'dark:border-emerald-500'); icon.classList.remove('hidden');
    } else {
        label.classList.add('border-stone-200', 'dark:border-stone-700'); label.classList.remove('border-emerald-500', 'bg-emerald-50', 'dark:bg-emerald-900/20', 'dark:border-emerald-500'); icon.classList.add('hidden');
    }
}

function renderMixes(prefix, exact, alt) {
    let container = document.getElementById(`${prefix}_results_container`); container.innerHTML = '';
    let header = document.getElementById(`${prefix}_results_header`);

    if(alt.length > 0 && alt[0].err) { 
        if(header) { header.classList.add('hidden'); header.classList.remove('flex'); }
        container.innerHTML = `<div class="animate-fade-in col-span-full p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-2xl font-bold text-sm text-center shadow-inner">${alt[0].err}</div>`; 
        return; 
    }

    let allHtml = '';
    if (exact.length > 0 || alt.length > 0) { 
        if(header) { header.classList.remove('hidden'); header.classList.add('flex'); }
    } else {
        if(header) { header.classList.add('hidden'); header.classList.remove('flex'); }
    }

    if(exact.length > 0) { allHtml += `<div class="animate-fade-in col-span-full text-xs font-black text-brand-600 dark:text-brand-500 uppercase tracking-widest mb-2 ml-2 flex items-center gap-2 mt-2"><span class="w-2 h-2 rounded-full bg-brand-500"></span> ${exact.length} Mix(es) Parfait(s)</div>`; exact.forEach(r => allHtml += buildCard(r, prefix, false, false, false)); }
    if(exact.length === 0 && alt.length > 0) { allHtml += `<div class="animate-fade-in col-span-full text-xs font-black text-amber-500 dark:text-amber-500 uppercase tracking-widest mb-2 ml-2 flex items-center gap-2 mt-2"><span class="w-2 h-2 rounded-full bg-amber-500"></span> Alternatives Proches</div>`; alt.slice(0,3).forEach(r => allHtml += buildCard(r, prefix, true, false, false)); }
    if(exact.length === 0 && alt.length === 0) { allHtml = `<div class="animate-fade-in col-span-full p-4 bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 border border-stone-200 dark:border-stone-700 rounded-2xl font-bold text-sm text-center shadow-inner transition-colors">Aucun Mix possible.</div>`; }
    
    container.innerHTML = allHtml; container.querySelectorAll('select').forEach(s => updateSim(s));
}

function buildCard(r, prefix, isAlt, noBtn = false, isCompact = false) {
    let bColor = isAlt ? 'border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900' : 'border-brand-200 dark:border-brand-700 bg-brand-50 dark:bg-brand-900';
    let tColor = isAlt ? 'text-amber-700 dark:text-amber-400' : 'text-brand-700 dark:text-brand-400';
    
    let totalWeight = 0; let aromaWeight = 0;
    let finalAroma = 0; let totalVol = prefix === 't1' ? r.finalVol : r.prepVol;

    if (totalVol > 0) finalAroma = (r.aroma / totalVol) * 100;

    let cfg = { ...r, type: prefix, isAlt: isAlt };
    let dataAttrs = `data-type="${prefix}" data-ratio="${r.realPgRatio}" data-base-pg="${r.realPgRatio}" `;
    if (prefix === 't1') {
        let bStr = r.bStr || parseFloat(document.getElementById('t1_booster_str').value) || 20;
        let finalNic = r.finalVol > 0 ? (r.nic * bStr) / r.finalVol : 0; dataAttrs += `data-aroma-perc="${finalAroma}" data-nic-mg="${finalNic}" `; cfg.bStr = bStr;
    } else if (prefix === 't2') {
        let bStr = r.bStr || parseFloat(document.getElementById('t2_booster_str').value) || 20;
        dataAttrs += `data-aroma-perc="${finalAroma}" data-aroma-vol="${r.aroma}" data-nic-max="${r.nicMax}" data-prep-vol="${r.prepVol}" data-booster-str="${bStr}" `; cfg.bStr = bStr;
    }

    let cfgStr = encodeURIComponent(JSON.stringify(cfg)); let theme = prefix === 't1' ? 'complet' : 'shortfill'; let compactClass = isCompact ? "compact-card" : "";
    let btnHtml = !noBtn ? `<button onclick="openModalFromCard(this)" class="p-2 text-stone-400 dark:text-stone-400 hover:text-brand-600 dark:hover:text-brand-400 bg-white dark:bg-stone-700 hover:bg-stone-50 dark:hover:bg-stone-600 rounded-xl transition-all shadow-sm ring-1 ring-stone-200 dark:ring-stone-600" title="Agrandir la fiche"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"></path><path d="M9 21H3v-6"></path><path d="M21 3l-7 7"></path><path d="M3 21l7-7"></path></svg></button>` : '';

    let titleText = r.globalName ? r.globalName : (prefix==='t1'?'Liquide Prêt':'Base Shortfill');
    let titleHtml = `<div class="font-extrabold text-stone-800 dark:text-stone-100 text-lg truncate pr-2" style="line-height:1.2;">${titleText} <span class="text-brand-600 dark:text-brand-400">${round1(totalVol)} ml</span></div>`;


    let html = `<div data-theme="${theme}" data-config="${cfgStr}" ${dataAttrs} class="${compactClass} animate-fade-in p-5 border ${bColor} rounded-3xl shadow-lg hover:shadow-xl hover:-translate-y-1 duration-300 flex flex-col h-full recipe-card-wrapper transition-all">
        <div class="flex-1">
            <div class="flex justify-between items-start mb-4 pb-3 border-b border-stone-200 dark:border-stone-700 transition-colors">
                <div class="overflow-hidden">
                    ${titleHtml}
                    <div class="mt-1.5"><span class="inline-block font-bold ${tColor} px-2 py-0.5 bg-white dark:bg-stone-800 rounded-lg shadow-sm transition-colors mt-1" style="font-size:11px; line-height:1.2;">${formatRatioStr(r.realPgRatio, true)}</span></div>
                </div>
                ${btnHtml}
            </div>
            <div class="card-body space-y-2 mb-4">`;

    if (r.multi) {
        let compoPgMl = 0;
        aromaWeight = 0;
        r.multi.forEach(item => {
            let vol = r.finalVol * (item.perc/100);
            if (item.type === 'aroma') compoPgMl += vol * (item.pg/100);
            aromaWeight += getLiquidWeight(item.type, vol, item.pg, item.degree);
        });
        totalWeight += aromaWeight;
        let compoPgRatio = r.aroma > 0 ? (compoPgMl / r.aroma) * 100 : 0;

        let originalPercBadge = (r.originalCompoTotal > 0) ? `<span class="block text-[9px] font-normal text-stone-500 mt-0.5">Recette originale : ${round1(r.originalCompoTotal)}%</span>` : '';
        
        let multiHtml = `<div class="bg-white dark:bg-stone-800 p-2.5 rounded-xl shadow-sm border border-stone-100 dark:border-stone-700 transition-colors mb-2 w-full">
            <div class="text-sm font-bold text-brand-600 dark:text-brand-400 flex justify-between items-center cursor-pointer select-none" onclick="event.stopPropagation(); this.nextElementSibling.classList.toggle('hidden'); this.querySelector('svg').classList.toggle('rotate-90');">
                <span class="flex items-center gap-1.5 leading-tight">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="transition-transform duration-200 shrink-0"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    <div class="flex flex-col">
                        <span>${r.compoName || 'Composition'}</span>
                        ${originalPercBadge}
                        <span class="inline-block font-bold text-brand-700 dark:text-brand-300 bg-brand-100 dark:bg-brand-900 px-1.5 py-0.5 rounded transition-colors mt-1 self-start" style="font-size:9px; line-height:1.2;">${formatRatioStr(compoPgRatio, false)}</span>
                    </div>
                </span>
                <div class="text-right leading-tight">
                    <span class="font-black text-stone-800 dark:text-stone-100 block">${round1(r.aroma)} ml</span>
                    <span class="block font-bold text-brand-600 dark:text-brand-400 mt-0.5" style="font-size:10px;">${round2(aromaWeight)} g</span>
                </div>
            </div>
            <div class="hidden mt-2 border-t border-stone-100 dark:border-stone-700 pt-2">
                <div class="grid grid-cols-1 gap-2 pdf-aroma-grid">`;
        
        r.multi.forEach(item => {
            let vol = r.finalVol * (item.perc/100); 
            let w = getLiquidWeight(item.type, vol, item.pg, item.degree);
            let icon = item.type === 'water' ? '💧' : (item.type === 'alcohol' ? '🍷' : '✨');
            let details = item.type === 'aroma' ? `${item.pg}PG` : (item.type === 'alcohol' ? `${item.degree}°` : 'Densité 1.0');
            
            multiHtml += `<div class="flex justify-between items-center text-xs bg-stone-50 dark:bg-stone-700/50 p-2 rounded">
                <div class="flex flex-col truncate pr-2">
                    <span class="font-bold text-stone-700 dark:text-stone-200 truncate" title="${item.name}">${icon} ${item.name} <span class="text-stone-400 ml-0.5" style="font-size:9px;">(${item.perc}%)</span></span>
                    <span class="text-[9px] text-stone-400 font-bold mt-0.5">${details}</span>
                </div>
                <div class="text-right whitespace-nowrap">
                    <span class="font-black text-stone-800 dark:text-stone-100 block">${round1(vol)} ml</span>
                    <span class="block text-brand-600" style="font-size:9px;">${round2(w)} g</span>
                </div>
            </div>`;
        });
        multiHtml += `</div></div></div>`;
        html += multiHtml;
    }
    
    r.bases.forEach(b => {
        if(b.vol > 0.1) {
            let baseWeight = getWeight(b.vol, b.pgRatio); totalWeight += baseWeight;
            html += `<div class="flex justify-between items-center bg-white dark:bg-stone-800 p-2.5 rounded-xl shadow-sm border border-stone-100 dark:border-stone-700 transition-colors">
                    <span class="text-sm font-bold text-stone-600 dark:text-stone-300 flex items-center gap-2">Base <span class="inline-block font-bold text-stone-600 dark:text-stone-300 bg-stone-100 dark:bg-stone-700 px-1.5 py-0.5 rounded transition-colors" style="font-size:10px; line-height:1.2;">${formatRatioStr(b.pgRatio, false)}</span></span>
                    <div class="text-right leading-tight"><span class="font-black text-stone-800 dark:text-stone-100">${round1(b.vol)} ml</span><span class="block font-bold text-brand-600 dark:text-brand-400 mt-0.5" style="font-size:10px;">${round2(baseWeight)} g</span></div>
                </div>`;
        }
    });

    if(prefix === 't1' && r.nic > 0) {
        let nicWeight = getWeight(r.nic, r.nicRatio); totalWeight += nicWeight;
        html += `<div class="flex justify-between items-center bg-white dark:bg-stone-800 p-2.5 rounded-xl shadow-sm border border-stone-100 dark:border-stone-700 transition-colors">
                <span class="text-sm font-bold text-brand-600 dark:text-brand-500 flex items-center gap-2">Booster <span class="inline-block font-bold text-brand-700 dark:text-brand-300 bg-brand-100 dark:bg-brand-900 px-1.5 py-0.5 rounded transition-colors" style="font-size:10px; line-height:1.2;">${formatRatioStr(r.nicRatio, false)}</span></span>
                <div class="text-right leading-tight"><span class="font-black text-stone-800 dark:text-stone-100">${round1(r.nic)} ml <span class="text-stone-500 font-bold" style="font-size:10px;">(${round2(r.nic/10)} u.)</span></span><span class="block font-bold text-brand-600 dark:text-brand-400 mt-0.5" style="font-size:10px;">${round2(nicWeight)} g</span></div>
            </div>`;
    }
    html += `</div></div>`; 

    if(prefix === 't1') {
        let bStr = r.bStr || parseFloat(document.getElementById('t1_booster_str').value) || 20;
        let finalNic = r.finalVol > 0 ? (r.nic * bStr) / r.finalVol : 0;
        html += `<div class="mt-auto pt-4 border-t border-stone-200 dark:border-stone-700 transition-colors">
            <div class="flex justify-between items-center"><span class="text-xs font-bold text-stone-500 dark:text-stone-400 uppercase tracking-widest">Taux finaux</span><div class="text-right"><span class="text-lg font-black text-brand-600 dark:text-brand-400">${round1(finalAroma)}%</span> <span class="text-xs text-stone-400 mr-1">arôme</span> <span class="mx-1 text-stone-300 dark:text-stone-600">|</span> <span class="text-lg font-black ${tColor}">${round1(finalNic)} mg/ml</span></div></div>
            <div class="text-right font-bold text-brand-600 dark:text-brand-400 mt-1" style="font-size:11px;">Poids total estimé : ${round2(totalWeight)} g</div>
        </div>`;
    }

    if(prefix === 't2') {
        let surconcentration = (r.aroma / r.prepVol) * 100;
        html += `<div class="mt-auto border-t border-stone-200 dark:border-stone-700 pt-3 text-right transition-colors"><span class="font-bold text-brand-600 dark:text-brand-400" style="font-size:11px;">Poids total estimé : ${round2(totalWeight)} g</span>`;
        html += `<br><span class="font-bold text-stone-500 mt-1 block" style="font-size:10px;">Surconcentration arôme : ${round1(surconcentration)}%</span>`;
        html += `</div>`;
        
        html += `<div class="sim-container mt-2 p-3 bg-white dark:bg-stone-800 rounded-xl text-stone-800 dark:text-stone-200 text-xs border border-stone-100 dark:border-stone-700 shadow-sm transition-colors" data-base-vol="${r.prepVol}" data-aroma-vol="${r.aroma}" data-max-nic="${r.nicMax}" data-bstr="${r.bStr||(parseFloat(document.getElementById('t2_booster_str').value)||20)}" data-base-pg="${r.realPgRatio}">
            <div class="flex items-center justify-between cursor-pointer select-none text-stone-500 dark:text-stone-400 font-bold uppercase tracking-widest border-b border-stone-200 dark:border-stone-700 pb-1.5 transition-colors" style="font-size:10px;" onclick="event.stopPropagation(); this.nextElementSibling.classList.toggle('hidden'); this.querySelector('svg').classList.toggle('rotate-90');">
                <span class="flex items-center gap-1.5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="transition-transform duration-200"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    🧪 Simulation d'ajout de boosters
                </span>
            </div>
            <div class="hidden mt-3">
                <div class="flex flex-col items-center gap-0.5 mb-3">
                    <span class="font-bold text-stone-500 dark:text-stone-400" style="font-size:10px;">Je prélève</span>
                    <select onchange="handlePreleveChange(this)" class="sim-sel-vol w-full max-w-[180px] bg-stone-50 dark:bg-stone-900 text-stone-800 dark:text-white rounded p-1 text-xs font-bold focus:outline-none border border-stone-200 dark:border-stone-700 text-center shadow-inner transition-colors">`;
        [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].forEach(v => { html += `<option value="${v}" ${v===50 ? 'selected' : ''}>${v} ml</option>`; });
        html += `   <option value="${r.prepVol}">Total (${round1(r.prepVol)}ml)</option><option value="custom">Manuel...</option></select>
                    <div class="sim-custom-wrapper hidden items-center bg-stone-50 dark:bg-stone-900 rounded overflow-hidden border border-stone-200 dark:border-stone-700 shadow-inner mt-1 w-full max-w-[180px] transition-colors"><button onclick="adjustCustomPreleve(this, -1)" class="btn-adjust-xs">-</button><input type="number" class="sim-custom-vol hide-arrows flex-1 min-w-0 w-full h-7 bg-stone-50 dark:bg-stone-900 text-stone-800 dark:text-white text-center text-xs font-bold focus:outline-none transition-colors" placeholder="ml" value="50" oninput="updateSim(this)"><button onclick="adjustCustomPreleve(this, 1)" class="btn-adjust-xs">+</button></div>
                    <div class="sim-preleve-weight text-brand-600 dark:text-brand-400 font-bold mt-1 text-center w-full" style="font-size:10px;"></div>
                </div>
                <div class="flex flex-col items-center mb-3 bg-stone-50 dark:bg-black/20 p-2 rounded-lg border border-stone-200 dark:border-stone-700 w-full max-w-[200px] mx-auto shadow-inner transition-colors">
                    <div class="w-full flex justify-between items-center mb-2 px-1"><span class="font-bold text-stone-500 dark:text-stone-400" style="font-size:10px;">Ratio des boosters:</span><select class="sim-b-ratio bg-white dark:bg-stone-900 text-stone-800 dark:text-white rounded px-1 py-0.5 font-bold focus:outline-none border border-stone-200 dark:border-stone-700 text-center shadow-sm transition-colors" style="font-size:10px;" onchange="updateSim(this)"><option value="100">100% PG</option><option value="90">90/10</option><option value="80">80/20</option><option value="70">70/30</option><option value="60">60/40</option><option value="50" selected>50/50</option><option value="40">40/60</option><option value="30">30/70</option><option value="20">20/80</option><option value="10">10/90</option><option value="0">100% VG</option></select></div>
                    <span class="font-bold text-stone-500 dark:text-stone-400 mb-1" style="font-size:10px;">J'ajoute</span>
                    <div class="flex items-center bg-white dark:bg-stone-900 rounded overflow-hidden border border-stone-200 dark:border-stone-700 shadow-sm transition-colors"><button onclick="adjustSimBoosters(this, -1)" class="btn-adjust-xs">-</button><input type="number" value="2" step="0.1" min="0" oninput="syncSimInputs(this, 'boosters')" class="sim-b-count hide-arrows w-12 min-w-0 h-7 bg-white dark:bg-stone-900 text-stone-800 dark:text-white text-center text-xs font-bold focus:outline-none transition-colors"><button onclick="adjustSimBoosters(this, 1)" class="btn-adjust-xs">+</button></div>
                    <span class="font-bold text-stone-500 dark:text-stone-400 mt-0.5" style="font-size:10px;">boosters</span><span class="font-black text-stone-400 dark:text-stone-500 uppercase tracking-widest my-1" style="font-size:9px;">ou</span>
                    <div class="flex items-center bg-white dark:bg-stone-900 rounded overflow-hidden border border-stone-200 dark:border-stone-700 shadow-sm transition-colors"><button onclick="adjustSimMl(this, -1)" class="btn-adjust-xs">-</button><input type="number" value="20" step="1" min="0" oninput="syncSimInputs(this, 'ml')" class="sim-ml-count hide-arrows w-12 min-w-0 h-7 bg-white dark:bg-stone-900 text-stone-800 dark:text-white text-center text-xs font-bold focus:outline-none transition-colors"><button onclick="adjustSimMl(this, 1)" class="btn-adjust-xs">+</button></div>
                    <span class="font-bold text-stone-500 dark:text-stone-400 mt-0.5" style="font-size:10px;">ml</span>
                </div>
                <div class="mt-3 text-center bg-stone-100 dark:bg-stone-900 p-2 rounded w-full border border-stone-200 dark:border-stone-700 transition-colors"><div class="font-bold text-stone-500 dark:text-stone-400" style="font-size:10px;">Résultat estimé :</div><div class="text-sm font-black text-brand-600 dark:text-brand-400 sim-result">...</div></div>
            </div>
        </div>`;

    }
    html += `</div>`; return html;
}

function buildT3CardHtml(c, noBtn = false, isCompact = false) {
    let aWeight = 0;
    if (c.multi) {
        let tPerc = c.multi.reduce((acc, v)=>acc+v.perc,0);
        c.multi.forEach(i => { aWeight += getLiquidWeight(i.type, c.aVol * (i.perc/tPerc), i.pg, i.degree); });
    } else { aWeight = getWeight(c.aVol, c.aPg); }
    let bWeight = getWeight(c.bVol, c.bPg); let nWeight = getWeight(c.nVol, c.nPg);
    let tVol = c.aVol + c.bVol + c.nVol; let tWeight = aWeight + bWeight + nWeight;
    let pgRatio = 50; let aRatio = 0; let finalNic = 0;
    if(tVol > 0) {
        let totalPg = 0;
        if(c.multi) {
            let tPerc = c.multi.reduce((acc, v)=>acc+v.perc,0);
            c.multi.forEach(i => { if(i.type==='aroma') totalPg += (c.aVol * (i.perc/tPerc)) * (i.pg/100); });
        } else { totalPg += c.aVol*(c.aPg/100); }
        totalPg += (c.bVol*(c.bPg/100)) + (c.nVol*(c.nPg/100));
        pgRatio = (totalPg / tVol) * 100; aRatio = (c.aVol / tVol) * 100; finalNic = (c.nVol * c.str) / tVol;
    }
    let cfgStr = encodeURIComponent(JSON.stringify(c)); let theme = 'manuel'; let compactClass = isCompact ? "compact-card" : "";
    let btnHtml = !noBtn ? `<button onclick="openModalFromCard(this)" class="p-2 text-stone-400 dark:text-stone-400 hover:text-brand-600 dark:hover:text-brand-400 bg-white dark:bg-stone-700 hover:bg-stone-50 dark:hover:bg-stone-600 rounded-xl transition-all shadow-sm ring-1 ring-stone-200 dark:ring-stone-600" title="Agrandir la fiche"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"></path><path d="M9 21H3v-6"></path><path d="M21 3l-7 7"></path><path d="M3 21l7-7"></path></svg></button>` : '';
    
    let titleText = c.globalName ? c.globalName : 'Mélange Manuel';
    
    let html = `<div data-theme="${theme}" data-config="${cfgStr}" data-type="t3" data-ratio="${pgRatio}" data-aroma-perc="${aRatio}" data-nic-mg="${finalNic}" class="${compactClass} recipe-card-wrapper p-5 border border-brand-200 dark:border-brand-700 bg-brand-50 dark:bg-brand-900 rounded-3xl flex flex-col transition-all w-full h-full hover:shadow-xl hover:-translate-y-1 duration-300">
        <div class="flex-1">
            <div class="flex justify-between items-start mb-4 pb-3 border-b border-stone-200/60 dark:border-stone-700 transition-colors">
                <div class="overflow-hidden">
                    <div class="font-extrabold text-stone-800 dark:text-stone-100 text-lg truncate pr-2" style="line-height:1.2;">${titleText} <span class="text-brand-600 dark:text-brand-400">${round1(tVol)} ml</span></div>
                    <div class="mt-1.5"><span class="inline-block font-bold text-brand-700 dark:text-brand-300 px-2 py-0.5 bg-white dark:bg-stone-800 rounded-lg shadow-sm transition-colors mt-1" style="font-size:11px; line-height:1.2;">${formatRatioStr(pgRatio, true)}</span></div>
                </div>
                ${btnHtml}
            </div>
            <div class="card-body space-y-2 mb-4">`;
    if (c.multi) {
        let originalPercBadge = (c.originalCompoTotal > 0) ? `<span class="block text-[9px] font-normal text-stone-500 mt-0.5">Recette originale : ${round1(c.originalCompoTotal)}%</span>` : '';
        let multiHtml = `<div class="bg-white dark:bg-stone-800 p-2.5 rounded-xl shadow-sm border border-stone-100 dark:border-stone-700 transition-colors mb-2 w-full">
            <div class="text-sm font-bold text-brand-600 dark:text-brand-400 flex justify-between items-center cursor-pointer select-none" onclick="event.stopPropagation(); this.nextElementSibling.classList.toggle('hidden'); this.querySelector('svg').classList.toggle('rotate-90');">
                <span class="flex items-center gap-1.5 leading-tight">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="transition-transform duration-200 shrink-0"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    <div class="flex flex-col">
                        <span>${c.compoName || 'Composition'}</span>
                        ${originalPercBadge}
                        <span class="inline-block font-bold text-brand-700 dark:text-brand-300 bg-brand-100 dark:bg-brand-900 px-1.5 py-0.5 rounded transition-colors mt-1 self-start" style="font-size:9px; line-height:1.2;">${formatRatioStr(c.aPg, false)}</span>
                    </div>
                </span>
                <div class="text-right leading-tight">
                    <span class="font-black text-stone-800 dark:text-stone-100 block">${round1(c.aVol)} ml</span>
                    <span class="block font-bold text-brand-600 dark:text-brand-400 mt-0.5" style="font-size:10px;">${round2(aWeight)} g</span>
                </div>
            </div>
            <div class="hidden mt-2 border-t border-stone-100 dark:border-stone-700 pt-2">
                <div class="grid grid-cols-1 gap-2 pdf-aroma-grid">`;
        
        let tPerc = c.multi.reduce((acc, v)=>acc+v.perc,0);
        c.multi.forEach(item => {
            let vol = c.aVol * (item.perc/tPerc); 
            let w = getLiquidWeight(item.type, vol, item.pg, item.degree);
            let icon = item.type === 'water' ? '💧' : (item.type === 'alcohol' ? '🍷' : '✨');
            let details = item.type === 'aroma' ? `${item.pg}PG` : (item.type === 'alcohol' ? `${item.degree}°` : 'Densité 1.0');
            
            multiHtml += `<div class="flex justify-between items-center text-xs bg-stone-50 dark:bg-stone-700/50 p-2 rounded">
                <div class="flex flex-col truncate pr-2">
                    <span class="font-bold text-stone-700 dark:text-stone-200 truncate" title="${item.name}">${icon} ${item.name} <span class="text-stone-400 ml-0.5" style="font-size:9px;">(${item.perc}%)</span></span>
                    <span class="text-[9px] text-stone-400 font-bold mt-0.5">${details}</span>
                </div>
                <div class="text-right whitespace-nowrap">
                    <span class="font-black text-stone-800 dark:text-stone-100 block">${round1(vol)} ml</span>
                    <span class="block text-brand-600" style="font-size:9px;">${round2(w)} g</span>
                </div>
            </div>`;
        });
        multiHtml += `</div></div></div>`;
        html += multiHtml;
    } 
	
	else if (c.aVol > 0) {
        html += `<div class="flex justify-between items-center bg-white dark:bg-stone-800 p-2.5 rounded-xl shadow-sm border border-stone-100 dark:border-stone-700 transition-colors">
                    <div class="flex flex-col items-start gap-1"><span class="text-sm font-bold text-brand-600 dark:text-brand-400">Arôme</span><span class="inline-block font-bold text-brand-700 dark:text-brand-300 bg-brand-100 dark:bg-brand-900 px-1.5 py-0.5 rounded transition-colors" style="font-size:9px; line-height:1.2;">${formatRatioStr(c.aPg, false)}</span></div>
                    <div class="text-right leading-tight"><span class="font-black text-stone-800 dark:text-stone-100">${round1(c.aVol)} ml</span><span class="block font-bold text-brand-600 dark:text-brand-400 mt-0.5" style="font-size:10px;">${round2(aWeight)} g</span></div>
                </div>`;
    }
    if (c.bVol > 0) {
        html += `<div class="flex justify-between items-center bg-white dark:bg-stone-800 p-2.5 rounded-xl shadow-sm border border-stone-100 dark:border-stone-700 transition-colors">
                    <span class="text-sm font-bold text-stone-600 dark:text-stone-400 flex items-center gap-2">Base <span class="inline-block font-bold text-stone-600 dark:text-stone-300 bg-stone-100 dark:bg-stone-700 px-1.5 py-0.5 rounded transition-colors" style="font-size:10px; line-height:1.2;">${formatRatioStr(c.bPg, false)}</span></span>
                    <div class="text-right leading-tight"><span class="font-black text-stone-800 dark:text-stone-100">${round1(c.bVol)} ml</span><span class="block font-bold text-brand-600 dark:text-brand-400 mt-0.5" style="font-size:10px;">${round2(bWeight)} g</span></div>
                </div>`;
    }
    if (c.nVol > 0) {
        html += `<div class="flex justify-between items-center bg-white dark:bg-stone-800 p-2.5 rounded-xl shadow-sm border border-stone-100 dark:border-stone-700 transition-colors">
                    <span class="text-sm font-bold text-brand-600 dark:text-brand-500 flex items-center gap-2">Booster <span class="inline-block font-bold text-brand-700 dark:text-brand-300 bg-brand-100 dark:bg-brand-900 px-1.5 py-0.5 rounded transition-colors" style="font-size:10px; line-height:1.2;">${formatRatioStr(c.nPg, false)}</span></span>
                    <div class="text-right leading-tight"><span class="font-black text-stone-800 dark:text-stone-100">${round1(c.nVol)} ml <span class="text-stone-500 font-bold" style="font-size:10px;">(${round2(c.nVol/10)} u.)</span></span><span class="block font-bold text-brand-600 dark:text-brand-400 mt-0.5" style="font-size:10px;">${round2(nWeight)} g</span></div>
                </div>`;
    }
    html += `</div></div>
        <div class="mt-auto pt-4 border-t border-stone-200 dark:border-stone-700 transition-colors">
            <div class="flex justify-between items-center">
                <span class="text-xs font-bold text-stone-500 dark:text-stone-400 uppercase tracking-widest">Taux finaux</span>
                <div class="text-right"><span class="text-lg font-black text-brand-600 dark:text-brand-400">${round1(aRatio)}%</span> <span class="text-xs text-stone-400 mr-1">arôme</span> <span class="mx-1 text-stone-300 dark:text-stone-600">|</span> <span class="text-lg font-black text-brand-700 dark:text-brand-400">${round1(finalNic)} mg/ml</span></div>
            </div>
            <div class="text-right font-bold text-brand-600 dark:text-brand-400 mt-1" style="font-size:11px;">Poids total estimé : ${round2(tWeight)} g</div>
        </div>
    </div>`;
    return html;
}

function buildBoostCardHtml(c, noBtn = false, isCompact = false) {
    let jWeight = getWeight(c.vol, c.pg); let bWeight = getWeight(c.bVol, c.bPg); let totalWeight = jWeight + bWeight;
    let finalVol = c.vol + c.bVol; let finalNic = finalVol > 0 ? (c.bVol * c.bStr) / finalVol : 0; let finalPgRatio = 50;
    if (c.advChecked) { let totalPgMl = (c.vol * (c.pg / 100)) + (c.bVol * (c.bPg / 100)); finalPgRatio = finalVol > 0 ? (totalPgMl / finalVol) * 100 : 50; }
    
    let cfgStr = encodeURIComponent(JSON.stringify(c)); let theme = 'boost'; let compactClass = isCompact ? "compact-card" : "";
    let btnHtml = !noBtn ? `<button onclick="openModalFromCard(this)" class="p-2 text-stone-400 dark:text-stone-400 hover:text-brand-600 dark:hover:text-brand-400 bg-white dark:bg-stone-700 hover:bg-stone-50 dark:hover:bg-stone-600 rounded-xl transition-all shadow-sm ring-1 ring-stone-200 dark:ring-stone-600" title="Agrandir la fiche"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"></path><path d="M9 21H3v-6"></path><path d="M21 3l-7 7"></path><path d="M3 21l7-7"></path></svg></button>` : '';
    let titleText = c.globalName ? c.globalName : 'Mélange Boosté';

    let html = `<div data-theme="${theme}" data-config="${cfgStr}" data-type="boost" data-ratio="${finalPgRatio}" data-aroma-perc="Inconnu" data-nic-mg="${finalNic}" class="${compactClass} recipe-card-wrapper p-5 border border-brand-200 dark:border-brand-700 bg-brand-50 dark:bg-brand-900 rounded-3xl flex flex-col transition-all w-full h-full">
        <div class="flex-1">
            <div class="flex justify-between items-start mb-4 pb-3 border-b border-stone-200 dark:border-stone-700">
                <div class="overflow-hidden">
                    <div class="font-extrabold text-stone-800 dark:text-stone-100 text-lg truncate pr-2" style="line-height:1.2;">${titleText} <span class="text-brand-600">${round1(finalVol)} ml</span></div>
                    <div class="mt-1.5"><span class="inline-block font-bold text-brand-700 dark:text-brand-300 px-2 py-0.5 bg-white dark:bg-stone-800 rounded-lg shadow-sm mt-1" style="font-size:11px; line-height:1.2;">${formatRatioStr(finalPgRatio, true)}</span></div>
                </div>
                ${btnHtml}
            </div>
            <div class="card-body space-y-2 mb-4">`;
    if(c.vol > 0) {
        html += `<div class="flex justify-between items-center bg-white dark:bg-stone-800 p-2.5 rounded-xl shadow-sm border border-stone-100 dark:border-stone-700">
                    <span class="text-sm font-bold text-stone-600 dark:text-stone-300 flex items-center gap-2">Jus <span class="inline-block font-bold bg-stone-100 dark:bg-stone-700 px-1.5 py-0.5 rounded" style="font-size:11px; line-height:1.2;">${formatRatioStr(c.pg, false)}</span></span>
                    <div class="text-right leading-tight"><span class="font-black text-stone-800 dark:text-stone-100">${round1(c.vol)} ml</span><span class="block font-bold text-brand-600 mt-0.5" style="font-size:10px;">${round2(jWeight)} g</span></div>
                </div>`;
    }
    if(c.bVol > 0) {
        html += `<div class="flex justify-between items-center bg-white dark:bg-stone-800 p-2.5 rounded-xl shadow-sm border border-stone-100 dark:border-stone-700">
                    <span class="text-sm font-bold text-brand-600 dark:text-brand-400 flex items-center gap-2">Booster <span class="inline-block font-bold bg-brand-100 dark:bg-brand-900 px-1.5 py-0.5 rounded" style="font-size:11px; line-height:1.2;">${formatRatioStr(c.bPg, false)}</span></span>
                    <div class="text-right leading-tight"><span class="font-black text-stone-800 dark:text-stone-100">${round1(c.bVol)} ml <span class="text-stone-500 font-bold" style="font-size:10px;">(${round2(c.bVol/10)} u.)</span></span><span class="block font-bold text-brand-600 mt-0.5" style="font-size:10px;">${round2(bWeight)} g</span></div>
                </div>`;
    }
    html += `</div></div>
        <div class="mt-auto pt-4 border-t border-stone-200 dark:border-stone-700">
            <div class="flex justify-between items-center">
                <span class="text-xs font-bold text-stone-500 uppercase">Taux finaux</span>
                <div class="text-right"><span class="text-lg font-black text-brand-700 dark:text-brand-400">${round1(finalNic)} mg/ml</span></div>
            </div>
            <div class="text-right font-bold text-brand-600 dark:text-brand-400 mt-1" style="font-size:11px;">Poids total estimé : ${round2(totalWeight)} g</div>
        </div>
    </div>`;
    return html;
}

/* ========================================== */
/* 9. SYSTÈME DE SIMULATION (SHORTFILL)       */
/* ========================================== */

function handlePreleveChange(selectEl) {
    let wrapper = selectEl.parentElement.querySelector('.sim-custom-wrapper');
    if (selectEl.value === 'custom') { wrapper.classList.remove('hidden'); wrapper.classList.add('flex'); } else { wrapper.classList.add('hidden'); wrapper.classList.remove('flex'); }
    updateSim(selectEl);
}
function adjustCustomPreleve(btn, step) { let input = btn.parentElement.querySelector('input'); input.value = Math.max(0, (parseFloat(input.value) || 0) + step); updateSim(input); }
function adjustSimBoosters(btn, step) { let input = btn.parentElement.querySelector('input'); input.value = Math.max(0, (parseFloat(input.value) || 0) + step); syncSimInputs(input, 'boosters'); }
function adjustSimMl(btn, step) { let input = btn.parentElement.querySelector('input'); input.value = Math.max(0, (parseFloat(input.value) || 0) + step); syncSimInputs(input, 'ml'); }
function syncSimInputs(inputEl, source) {
    let container = inputEl.closest('.sim-container'); let bInput = container.querySelector('.sim-b-count'); let mlInput = container.querySelector('.sim-ml-count');
    if (source === 'boosters') mlInput.value = (parseFloat(bInput.value) || 0) * 10; else bInput.value = (parseFloat(mlInput.value) || 0) / 10;
    updateSim(inputEl);
}

function updateSim(el) {
    let container = el.closest('.recipe-card-wrapper'); if(!container) return;
    let sel = container.querySelector('.sim-sel-vol'); let customInp = container.querySelector('.sim-custom-vol');
    let bCountInp = container.querySelector('.sim-b-count'); let resEl = container.querySelector('.sim-result');
    let bRatioSel = container.querySelector('.sim-b-ratio'); let preleveWeightEl = container.querySelector('.sim-preleve-weight');
    let simContObj = container.querySelector('.sim-container');
    if(!sel || !bCountInp || !resEl || !simContObj) return;

    let preleveVol = sel.value === 'custom' ? (parseFloat(customInp.value) || 0) : (parseFloat(sel.value) || 0);
    let bCount = parseFloat(bCountInp.value) || 0; let bStr = parseFloat(simContObj.getAttribute('data-bstr')) || 20;
    let maxNic = parseFloat(simContObj.getAttribute('data-max-nic')) || 0; let totalAroma = parseFloat(simContObj.getAttribute('data-aroma-vol')) || 0;
    let prepVolAttr = parseFloat(simContObj.getAttribute('data-base-vol')) || 0; let basePg = parseFloat(simContObj.getAttribute('data-base-pg')) || 50;
    let bPg = bRatioSel ? parseFloat(bRatioSel.value) : 50;

    if(preleveWeightEl) preleveWeightEl.innerText = preleveVol > 0 ? round2(getWeight(preleveVol, basePg)) + " g" : "";
    
    let bVol = bCount * 10; let finalVol = preleveVol + bVol; let aromaInSample = preleveVol * (totalAroma / prepVolAttr);
    
    if (finalVol > 0) {
        let finalNic = (bVol * bStr) / finalVol; let finalAromaPerc = (aromaInSample / finalVol) * 100;
        let finalPgRatio = ((preleveVol * (basePg / 100)) + (bVol * (bPg / 100))) / finalVol * 100;
        let aromaHtml = `<br><span class="text-[10px] text-stone-500 dark:text-stone-400 font-bold mt-1 inline-block">Arôme dilué à ${round1(finalAromaPerc)}% | Ratio final: ${formatRatioStr(finalPgRatio)}</span>`;
        if (finalNic > maxNic) resEl.innerHTML = `${round1(finalVol)} ml à <span class="text-brand-600 dark:text-brand-400">${round1(finalNic)} mg/ml</span>${aromaHtml}<br><span class="text-[10px] text-red-500 dark:text-red-400 font-bold block mt-1 leading-tight">⚠️ Taux max (${maxNic} mg) dépassé,<br>arôme trop dilué !</span>`;
        else resEl.innerHTML = `${round1(finalVol)} ml à <span class="text-brand-600 dark:text-brand-400">${round1(finalNic)} mg/ml</span>${aromaHtml}`;
    } else resEl.innerText = "0 ml";
}

/* ========================================== */
/* 10. GESTION DES MODALES GENERALES          */
/* ========================================== */

function openCalcModal() { document.getElementById('calc_modal').classList.remove('hidden'); }
function closeCalcModal() { document.getElementById('calc_modal').classList.add('hidden'); }
function openHelpModal() { document.getElementById('help_modal').classList.remove('hidden'); }
function closeHelpModal() { document.getElementById('help_modal').classList.add('hidden'); }
function updateCalcDisplay() { document.getElementById('calc_display').innerText = calcExpr || "0"; }
function calcAppend(val) { if (calcExpr === "Erreur") calcExpr = ""; calcExpr += val; updateCalcDisplay(); }
function calcClear() { calcExpr = ""; updateCalcDisplay(); }
function calcResult() {
    try {
        let res = new Function('return ' + calcExpr.replace(/×/g, '*').replace(/÷/g, '/').replace(/%/g, '/100'))();
        if (isNaN(res) || !isFinite(res)) throw new Error("Erreur");
        calcExpr = res.toString(); updateCalcDisplay();
    } catch(e) { calcExpr = "Erreur"; updateCalcDisplay(); setTimeout(calcClear, 1000); }
}

document.addEventListener('keydown', function(event) {
    if (event.key === "Escape") {
        if (!document.getElementById('jedi_identity_modal').classList.contains('hidden')) { closeJediModal(); return; }
        if (!document.getElementById('export_prompt_modal').classList.contains('hidden')) { cancelExport(); return; }
        if (!document.getElementById('export_compo_prompt_modal').classList.contains('hidden')) { closeExportCompoPrompt(); return; }
        if (!document.getElementById('compo_edit_modal').classList.contains('hidden')) { closeCompoEditModal(); return; }
        if (!document.getElementById('recipe_modal').classList.contains('hidden')) { closeRecipeModal(); return; }
        if (!document.getElementById('help_modal').classList.contains('hidden')) { closeHelpModal(); return; }
        if (!document.getElementById('calc_modal').classList.contains('hidden')) { closeCalcModal(); return; }
        if (!document.getElementById('share_flyer_modal').classList.contains('hidden')) { closeShareFlyerModal(); return; }
        if (!document.getElementById('settings_modal').classList.contains('hidden')) { closeSettingsModal(); return; }
        if (!document.getElementById('reset_confirm_modal').classList.contains('hidden')) { closeResetConfirm(); return; }
        if (!document.getElementById('html_confirm_modal').classList.contains('hidden')) { closeHtmlConfirm(); return; }
    }
});

/* ========================================== */
/* MES DONNEES, SAUVEGARDES, IMPORT, EXPORT   */
/* ========================================== */

function updateSettingsBadge() {
    let needsExport = localStorage.getItem('jediy_needs_export') === 'true';
    let gearBadge = document.getElementById('gear_badge');
    let exportBadge = document.getElementById('export_json_badge');
    
    if(gearBadge) { 
        if(deferredPrompt || unreadNotification || needsExport) gearBadge.classList.remove('hidden'); 
        else gearBadge.classList.add('hidden'); 
    }
    if(exportBadge) {
        if(needsExport) exportBadge.classList.remove('hidden');
        else exportBadge.classList.add('hidden');
    }
}

function setNeedsExport(state) {
    if (state) localStorage.setItem('jediy_needs_export', 'true');
    else localStorage.removeItem('jediy_needs_export');
    updateSettingsBadge();
}

function openSettingsModal() { 
    unreadNotification = false; 
    updateSettingsBadge();
    document.getElementById('settings_modal').classList.remove('hidden'); 
}
function closeSettingsModal() { document.getElementById('settings_modal').classList.add('hidden'); }
function openResetConfirm() { closeSettingsModal(); document.getElementById('reset_confirm_modal').classList.remove('hidden'); }
function closeResetConfirm() { document.getElementById('reset_confirm_modal').classList.add('hidden'); }
function showAlert(msg) { let m = document.getElementById('alert_modal'); document.getElementById('alert_text').innerText = msg; m.classList.remove('hidden'); setTimeout(() => m.classList.add('hidden'), 2500); }
function openHtmlConfirm(msg, callback) {
    document.getElementById('html_confirm_msg').innerText = msg;
    let btnOk = document.getElementById('html_confirm_btn_ok');
    btnOk.onclick = () => {
        closeHtmlConfirm();
        if (callback) callback();
    };
    document.getElementById('html_confirm_modal').classList.remove('hidden');
}

function closeHtmlConfirm() {
    document.getElementById('html_confirm_modal').classList.add('hidden');
}
function toggleSaveMixBtn() { 
    let val = document.getElementById('mix_name_input').value.trim(); 
    let isValid = val.length >= 2;
    
    let saveBtn = document.getElementById('btn_save_mix'); 
    if(saveBtn) saveBtn.disabled = !isValid;
    
    document.getElementById('btn_copy_text').disabled = false;
    document.getElementById('btn_share_mix').disabled = false;
    document.getElementById('btn_pdf_mix').disabled = false;
    if(document.getElementById('btn_png_mix')) document.getElementById('btn_png_mix').disabled = false;
    
    if(currentMixCard) {
        let titleEl = currentMixCard.querySelector('.font-extrabold.text-stone-800');
        if(titleEl) {
            let baseText = "";
            let cfgStr = currentMixCard.getAttribute('data-config'); 
            if(cfgStr) {
                let c = JSON.parse(decodeURIComponent(cfgStr));
                if(c.type === 't1') baseText = `Liquide Prêt <span class="text-brand-600 dark:text-brand-400">${round1(c.finalVol)} ml</span>`;
                else if(c.type === 't2') baseText = `Base Shortfill <span class="text-brand-600 dark:text-brand-400">${round1(c.prepVol)} ml</span>`;
                else if(c.type === 't3') baseText = `Mélange Manuel <span class="text-brand-600 dark:text-brand-400">${round1(c.aVol+c.bVol+c.nVol)} ml</span>`;
                else if(c.type === 'boost') baseText = `Mélange Boosté <span class="text-brand-600">${round1(c.vol+c.bVol)} ml</span>`;
            }
            let displayName = val.length > 0 ? val : "Mix";
            titleEl.innerHTML = `${displayName}<br><span class="text-sm font-normal text-stone-500">${baseText}</span>`;
        }
    }
}

function saveCurrentMix() {
    if(!currentMixCard) return;
    let cfgStr = currentMixCard.getAttribute('data-config'); if(!cfgStr) return;
    let cfg = JSON.parse(decodeURIComponent(cfgStr));
    let name = document.getElementById('mix_name_input').value.trim();
    if(name.length < 2) return;
    savedMixes.push({ id: Date.now(), name: name, config: cfg });
    localStorage.setItem('jediy_mixes', JSON.stringify(savedMixes));
    setNeedsExport(true);
    showAlert("Mix sauvegardé !"); cancelExport();
    if(document.getElementById('tab_mes_donnees').classList.contains('active')) renderMesMixes();
}

function setSort(sortType) {
    document.getElementById('sort_mixes').value = sortType;
    let btns = ['recent', 'old', 'az', 'za'];
    btns.forEach(b => {
        let el = document.getElementById('sort_btn_' + b);
        if(b === sortType) el.className = "flex-1 sm:flex-none px-3 py-1.5 bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 rounded-lg text-xs font-bold shadow-sm transition-all";
        else el.className = "flex-1 sm:flex-none px-3 py-1.5 text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-100 rounded-lg text-xs font-bold transition-all";
    });
    renderMesMixes(); renderMesCompos();
}

function toggleGroupMixes() {
    groupMixes = !groupMixes;
    let btn = document.getElementById('btn_group_mixes');
    if (groupMixes) { btn.classList.add('bg-green-100', 'text-green-700', 'border-green-300', 'dark:bg-green-900/30', 'dark:text-green-400'); btn.classList.remove('bg-stone-100', 'text-stone-500', 'dark:bg-stone-800', 'dark:text-stone-400'); } 
    else { btn.classList.remove('bg-green-100', 'text-green-700', 'border-green-300', 'dark:bg-green-900/30', 'dark:text-green-400'); btn.classList.add('bg-stone-100', 'text-stone-500', 'dark:bg-stone-800', 'dark:text-stone-400'); }
    renderMesMixes(); renderMesCompos();
}

function switchDataTab(tab) {
    let btnCreate = document.getElementById('btn_create_compo');
    let btnGroup = document.getElementById('btn_group_mixes'); // On cible le bouton Regrouper
    
    if(tab === 'mixes') {
        document.getElementById('mes_mixes_list').classList.remove('hidden'); 
        document.getElementById('mes_compos_list').classList.add('hidden');
        document.getElementById('tab_btn_mes_mixes').className = "pb-3 text-sm font-black text-brand-600 dark:text-brand-400 border-b-2 border-brand-600 dark:border-brand-400 whitespace-nowrap transition-colors";
        document.getElementById('tab_btn_mes_compos').className = "pb-3 text-sm font-bold text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 border-b-2 border-transparent whitespace-nowrap transition-colors";
        document.getElementById('btn_import_compo').classList.add('hidden');
        if(btnCreate) btnCreate.classList.add('hidden');
        
        // On affiche le bouton Regrouper
        if(btnGroup) { btnGroup.classList.remove('hidden'); btnGroup.classList.add('flex'); }
    } else {
        document.getElementById('mes_compos_list').classList.remove('hidden'); 
        document.getElementById('mes_mixes_list').classList.add('hidden');
        document.getElementById('tab_btn_mes_compos').className = "pb-3 text-sm font-black text-brand-600 dark:text-brand-400 border-b-2 border-brand-600 dark:border-brand-400 whitespace-nowrap transition-colors";
        document.getElementById('tab_btn_mes_mixes').className = "pb-3 text-sm font-bold text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 border-b-2 border-transparent whitespace-nowrap transition-colors";
        document.getElementById('btn_import_compo').classList.remove('hidden');
        if(btnCreate) btnCreate.classList.remove('hidden');
        
        // On masque le bouton Regrouper
        if(btnGroup) { btnGroup.classList.add('hidden'); btnGroup.classList.remove('flex'); }
    }
}

function generateSavedMixHtml(m) {
    let c = m.config; let html = ''; let theme = getTheme(c.type);
    c.globalName = m.name;
    
    // On passe 'true' pour cacher le petit bouton d'agrandissement
    if(c.type === 't1' || c.type === 't2') html = buildCard(c, c.type, c.isAlt, true, true);
    else if(c.type === 'boost') html = buildBoostCardHtml(c, true, true);
    else html = buildT3CardHtml(c, true, true);
    
    // On ajoute cursor-pointer et onclick sur la div mère, et stopPropagation sur les boutons
    return `<div class="relative group mt-6 h-full w-full cursor-pointer" data-theme="${theme}" onclick="openModalFromCard(this.querySelector('.recipe-card-wrapper'))">
        <div class="absolute -top-4 right-4 z-10 flex gap-2">
            <button onclick="event.stopPropagation(); editMix(${m.id})" class="w-8 h-8 flex items-center justify-center bg-stone-800 dark:bg-stone-700 text-white rounded-lg shadow-sm border-2 border-white dark:border-stone-800 hover:bg-stone-700 transition-colors" title="Éditer">✏️</button>
            <button onclick="event.stopPropagation(); deleteMix(${m.id})" class="w-8 h-8 flex items-center justify-center bg-red-500 dark:bg-red-600 text-white rounded-lg shadow-sm border-2 border-white dark:border-stone-800 hover:bg-red-600 transition-colors" title="Supprimer">🗑️</button>
        </div>
        ${html}
    </div>`;
}

/* ========================================== */
/* MODIFICATION : generateSavedCompoHtml ET   */
/* FONCTIONS DU SIMULATEUR DE CONCENTRÉ       */
/* ========================================== */

function generateSavedCompoHtml(c) {
    let totalPerc = c.items.reduce((acc, v)=>acc+v.perc, 0);
    let safeItems = encodeURIComponent(JSON.stringify(c.items));

    // Vue 1 : Fiche standard
    let compoHtml = `<div id="compo_view_${c.id}" class="space-y-2 mb-4 animate-fade-in">`;
    c.items.forEach(i => {
        let icon = i.type === 'water' ? '💧' : (i.type === 'alcohol' ? '🍷' : '✨');
        let details = i.type === 'aroma' ? `${i.pg}PG` : (i.type === 'alcohol' ? `${i.degree}°` : '');
        compoHtml += `<div class="flex justify-between items-center bg-white dark:bg-stone-800 p-2.5 rounded-xl shadow-sm border border-stone-100 dark:border-stone-700 text-sm transition-colors">
<div class="flex flex-col">
    <span class="font-bold text-stone-700 dark:text-stone-200">${icon} ${i.name}</span>
    <span class="text-[10px] text-stone-400 dark:text-stone-500 mt-0.5">${details}</span>
</div>
            <span class="font-black text-brand-600 dark:text-brand-400">${i.perc}%</span>
        </div>`;
    });
    compoHtml += `</div>`;

    // Vue 2 : Simulateur de concentré
    let concHtml = `
    <div id="conc_view_${c.id}" class="hidden flex-col mb-4 animate-fade-in">
        <label class="block text-xs font-bold text-stone-500 dark:text-stone-400 mb-2">Volume final du concentré</label>
        <div class="flex items-center gap-2 mb-3">
            <button onclick="adjustConcVol(${c.id}, -5, '${safeItems}')" class="btn-adjust-sm">-</button>
            <input type="number" id="conc_vol_${c.id}" value="30" class="hide-arrows flex-1 min-w-0 h-10 bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg text-center font-bold text-stone-800 dark:text-stone-100 transition-colors" oninput="updateConcSim(${c.id}, '${safeItems}')">
            <button onclick="adjustConcVol(${c.id}, 5, '${safeItems}')" class="btn-adjust-sm">+</button>
            <span class="text-xs font-bold text-stone-500 w-4">ml</span>
        </div>
        <div class="grid grid-cols-4 gap-2 mb-4">
            <button onclick="setConcVol(${c.id}, 10, '${safeItems}')" class="py-1.5 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 rounded-lg font-bold text-xs hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors shadow-sm">10ml</button>
            <button onclick="setConcVol(${c.id}, 30, '${safeItems}')" class="py-1.5 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 rounded-lg font-bold text-xs hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors shadow-sm">30ml</button>
            <button onclick="setConcVol(${c.id}, 50, '${safeItems}')" class="py-1.5 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 rounded-lg font-bold text-xs hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors shadow-sm">50ml</button>
            <button onclick="setConcVol(${c.id}, 100, '${safeItems}')" class="py-1.5 bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 rounded-lg font-bold text-xs hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors shadow-sm">100ml</button>
        </div>
        <div id="conc_list_${c.id}" class="space-y-2"></div>
    </div>`;

    let html = `<div class="bg-brand-50 dark:bg-brand-900 rounded-3xl p-5 border border-brand-200 dark:border-brand-700 h-full flex flex-col hover:shadow-xl transition-all">
        <div class="flex justify-between items-start mb-3 border-b border-stone-200 dark:border-stone-700 pb-3">
            <div>
                <div class="font-extrabold text-stone-800 dark:text-stone-100 text-lg">${c.name}</div>
                <div class="text-xs font-bold text-brand-600 mt-1">${c.items.length} ingrédient(s) | ${round1(totalPerc)}% Total</div>
            </div>
            <div class="flex gap-2">
                <button onclick="editCompo(${c.id})" class="w-8 h-8 flex items-center justify-center bg-stone-100 dark:bg-stone-700 text-stone-600 dark:text-stone-300 rounded-lg shadow-sm border border-stone-200 dark:border-stone-600 hover:bg-stone-200 dark:hover:bg-stone-600 transition-colors" title="Éditer">✏️</button>
                <button onclick="deleteCompo(${c.id})" class="w-8 h-8 flex items-center justify-center bg-red-500 dark:bg-red-600 text-white rounded-lg shadow-sm border-2 border-white dark:border-stone-800 hover:bg-red-600 transition-colors" title="Supprimer">🗑️</button>
            </div>
        </div>
        
        <div class="flex bg-white dark:bg-stone-800 p-1 rounded-xl mb-4 border border-stone-200 dark:border-stone-700 transition-colors">
            <button id="compo_tab_btn_${c.id}" onclick="switchCompoTab(${c.id}, 'compo', '${safeItems}')" class="flex-1 py-1.5 rounded-lg text-xs font-bold bg-brand-100 dark:bg-brand-800 text-brand-800 dark:text-brand-100 shadow-sm transition-all">Fiche</button>
            <button id="conc_tab_btn_${c.id}" onclick="switchCompoTab(${c.id}, 'conc', '${safeItems}')" class="flex-1 py-1.5 rounded-lg text-xs font-bold text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 transition-all">Créer Concentré</button>
        </div>

        ${compoHtml}
        ${concHtml}

        <div class="mt-auto pt-3">
            <button onclick="directExportCompo(${c.id})" class="w-full py-2 bg-white dark:bg-stone-700 text-brand-600 dark:text-brand-400 font-bold text-sm rounded-xl border border-stone-200 dark:border-stone-600 shadow-sm transition-all hover:bg-stone-50 dark:hover:bg-stone-600">Exporter</button>
        </div>
    </div>`;
    return html;
}

function directExportCompo(id) {
    currentEditCompoId = id; // On cible la bonne composition
    openExportCompoPrompt(); // On ouvre directement la modale d'export
}

function switchCompoTab(id, tab, safeItems) {
    let btnCompo = document.getElementById(`compo_tab_btn_${id}`);
    let btnConc = document.getElementById(`conc_tab_btn_${id}`);
    let viewCompo = document.getElementById(`compo_view_${id}`);
    let viewConc = document.getElementById(`conc_view_${id}`);

    let activeClass = "flex-1 py-1.5 rounded-lg text-xs font-bold bg-brand-100 dark:bg-brand-800 text-brand-800 dark:text-brand-100 shadow-sm transition-all";
    let inactiveClass = "flex-1 py-1.5 rounded-lg text-xs font-bold text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 transition-all";

    if(tab === 'compo') {
        btnCompo.className = activeClass; btnConc.className = inactiveClass;
        viewCompo.classList.remove('hidden'); viewConc.classList.add('hidden'); viewConc.classList.remove('flex');
    } else {
        btnConc.className = activeClass; btnCompo.className = inactiveClass;
        viewConc.classList.remove('hidden'); viewConc.classList.add('flex'); viewCompo.classList.add('hidden');
        updateConcSim(id, safeItems); 
    }
}

function adjustConcVol(id, step, safeItems) {
    let el = document.getElementById(`conc_vol_${id}`);
    el.value = Math.max(0, (parseFloat(el.value) || 0) + step);
    updateConcSim(id, safeItems);
}

function setConcVol(id, vol, safeItems) {
    document.getElementById(`conc_vol_${id}`).value = vol;
    updateConcSim(id, safeItems);
}

function updateConcSim(id, safeItems) {
    let items = JSON.parse(decodeURIComponent(safeItems));
    let vol = parseFloat(document.getElementById(`conc_vol_${id}`).value) || 0;
    let listContainer = document.getElementById(`conc_list_${id}`);
    
    if(vol <= 0 || items.length === 0) {
        listContainer.innerHTML = '<div class="text-xs text-center text-stone-500 mt-2">Volume invalide</div>';
        return;
    }

    let totalPerc = items.reduce((acc, v) => acc + v.perc, 0);
    let html = '';
    
    items.forEach(i => {
        let v_i = vol * (i.perc / totalPerc);
        let w_i = getLiquidWeight(i.type, v_i, i.pg, i.degree);
        let icon = i.type === 'water' ? '💧' : (i.type === 'alcohol' ? '🍷' : '✨');
        
        html += `<div class="flex justify-between items-center bg-white dark:bg-stone-800 p-2 rounded-xl shadow-sm border border-stone-100 dark:border-stone-700 text-sm transition-colors">
            <span class="font-bold text-stone-700 dark:text-stone-200 truncate pr-2" title="${i.name}">${icon} ${i.name}</span>
            <div class="text-right leading-tight whitespace-nowrap">
                <span class="font-black text-stone-800 dark:text-stone-100 block">${round2(v_i)} ml</span>
<span class="text-[10px] font-bold text-brand-600 block">${round2(w_i)} g</span>
            </div>
        </div>`;
    });
    listContainer.innerHTML = html;
}

function renderMesMixes() {
    let container = document.getElementById('mes_mixes_list'); if(!container) return;
    if(savedMixes.length === 0) { container.innerHTML = '<div class="col-span-full p-6 bg-stone-100 dark:bg-stone-800 text-center text-stone-500 rounded-2xl">Aucun mix sauvegardé pour le moment.</div>'; return; }
    
    let sort = document.getElementById('sort_mixes').value; let arr = [...savedMixes];
    if(sort === 'recent') arr.sort((a,b)=>b.id-a.id); else if(sort === 'old') arr.sort((a,b)=>a.id-b.id);
    else if(sort === 'az') arr.sort((a,b)=>a.name.localeCompare(b.name)); else if(sort === 'za') arr.sort((a,b)=>b.name.localeCompare(a.name));

    if (groupMixes) {
        let grouped = { 't1': [], 't2': [], 'boost': [], 't3': [] };
        arr.forEach(m => { if(grouped[m.config.type]) grouped[m.config.type].push(m); else grouped['t3'].push(m); });
        let typeNames = { 't1': 'Liquide Complet', 't2': 'Shortfill', 'boost': 'Boost Rapide', 't3': 'Mélange Manuel' };
        let finalHtml = '';
        for (let type in grouped) {
            if(grouped[type].length > 0) {
                finalHtml += `<div class="col-span-full text-lg font-black text-brand-600 dark:text-brand-400 mt-4 border-b-2 border-stone-200 dark:border-stone-700 pb-2 w-full">${typeNames[type]}</div>`;
                grouped[type].forEach(m => finalHtml += generateSavedMixHtml(m));
            }
        }
        container.innerHTML = finalHtml;
    } else { container.innerHTML = arr.map(m => generateSavedMixHtml(m)).join(''); }
    container.querySelectorAll('select.sim-sel-vol, select.sim-b-ratio').forEach(s => updateSim(s));
}

function renderMesCompos() {
    let container = document.getElementById('mes_compos_list'); if(!container) return;
    if(savedCompos.length === 0) { container.innerHTML = '<div class="col-span-full p-6 bg-stone-100 dark:bg-stone-800 text-center text-stone-500 rounded-2xl">Aucune composition sauvegardée.</div>'; return; }
    
    let sort = document.getElementById('sort_mixes').value; let arr = [...savedCompos];
    if(sort === 'recent') arr.sort((a,b)=>b.id-a.id); else if(sort === 'old') arr.sort((a,b)=>a.id-b.id);
    else if(sort === 'az') arr.sort((a,b)=>a.name.localeCompare(b.name)); else if(sort === 'za') arr.sort((a,b)=>b.name.localeCompare(a.name));

    container.innerHTML = arr.map(c => generateSavedCompoHtml(c)).join('');
}

function editMix(id) {
    let m = savedMixes.find(x => x.id === id); if(!m) return; let c = m.config;
    if(c.type === 't1') {
        switchTab('tab_complet'); document.getElementById('t1_vol').value = c.finalVol;
        if(c.multi) { setAromaMode('t1', 'multi'); state.t1.multi = JSON.parse(JSON.stringify(c.multi)); document.getElementById('t1_compo_name').value = c.compoName || ""; renderMultiList('t1'); }
        else { setAromaMode('t1', 'mono'); document.getElementById('t1_aroma_perc').value = (c.aroma/c.finalVol)*100; document.getElementById('t1_adv_aroma').checked = c.aromaPg !== 100; document.getElementById('t1_aroma_pg').value = 100 - c.aromaPg; toggleAdvAroma('t1'); }
        document.getElementById('t1_ratio_pg').value = 100 - c.realPgRatio;
        let bStr = c.bStr || parseFloat(document.getElementById('t1_booster_str').value) || 20; document.getElementById('t1_nic_mg').value = round1((c.nic * bStr) / c.finalVol);
        toggleVolMode('t1','defined'); setNicMode('t1','mg');
        if(c.globalName) document.getElementById('t1_global_name').value = c.globalName;
    } else if (c.type === 't2') {
        switchTab('tab_booster'); document.getElementById('t2_vol').value = c.prepVol; document.getElementById('t2_max_nic').value = c.nicMax; document.getElementById('t2_ratio_pg').value = 100 - c.realPgRatio;
        if(c.multi) { setAromaMode('t2', 'multi'); state.t2.multi = JSON.parse(JSON.stringify(c.multi)); document.getElementById('t2_compo_name').value = c.compoName || ""; renderMultiList('t2'); }
        else { setAromaMode('t2', 'mono'); document.getElementById('t2_aroma_perc').value = (c.aroma/c.finalVol)*100; document.getElementById('t2_adv_aroma').checked = c.aromaPg !== 100; document.getElementById('t2_aroma_pg').value = 100 - c.aromaPg; toggleAdvAroma('t2'); }
        toggleVolMode('t2','defined');
        if(c.globalName) document.getElementById('t2_global_name').value = c.globalName;
    } else if (c.type === 'boost') {
        switchTab('tab_boost_simple'); document.getElementById('tab_boost_vol').value = c.vol; document.getElementById('tab_boost_ml').value = c.bVol;
        document.getElementById('tab_boost_str').value = c.bStr; document.getElementById('tab_boost_adv').checked = c.advChecked;
        if(c.advChecked) { document.getElementById('tab_boost_pg').value = 100 - c.pg; document.getElementById('tab_boost_bpg').value = 100 - c.bPg; }
        document.getElementById('tab_boost_adv_panel').classList.toggle('hidden', !c.advChecked); syncBoostSimple('ml');
    } else if (c.type === 't3') {
        switchTab('tab_manuel'); 
        if(c.multi) {
            setAromaMode('t3', 'multi'); state.t3.multi = JSON.parse(JSON.stringify(c.multi)); document.getElementById('t3_compo_name').value = c.compoName || ""; document.getElementById('t3_aroma_vol_multi').value = c.aVol; renderMultiList('t3');
        } else {
            setAromaMode('t3', 'mono'); document.getElementById('t3_aroma_vol').value = c.aVol; document.getElementById('t3_aroma_pg').value = 100 - c.aPg; document.getElementById('t3_aroma_pg_val').innerText = formatRatioStr(c.aPg, false);
        }
        document.getElementById('t3_base_vol').value = c.bVol; document.getElementById('t3_base_pg').value = 100 - c.bPg; document.getElementById('t3_boost_vol').value = c.nVol;
        document.getElementById('t3_boost_pg').value = 100 - c.nPg; document.getElementById('t3_boost_str').value = c.str;
        document.getElementById('t3_base_pg_val').innerText = formatRatioStr(c.bPg, false); document.getElementById('t3_boost_pg_val').innerText = formatRatioStr(c.nPg, false);
    }
    if(c.type === 't1' || c.type === 't2') {
        document.querySelectorAll(`.${c.type}_base_chk`).forEach(chk => { chk.checked = c.bases.some(b => b.pgRatio === parseInt(chk.value)); toggleCheckBtn(chk); });
        if(c.type === 't1') document.querySelectorAll('.t1_boost_chk').forEach(chk => { chk.checked = (c.nicRatio === parseInt(chk.value)); toggleCheckBtn(chk); });
    }
    triggerCalc(); window.scrollTo({top: 0, behavior: 'smooth'});
}

function deleteMix(id) {
    openHtmlConfirm("Supprimer ce mix ?", () => {
        savedMixes = savedMixes.filter(x => x.id !== id); 
        localStorage.setItem('jediy_mixes', JSON.stringify(savedMixes)); 
        renderMesMixes(); 
    });
}
function deleteCompo(id) { 
    openHtmlConfirm("Supprimer cette composition ?", () => {
        savedCompos = savedCompos.filter(x => x.id !== id); localStorage.setItem('jediy_compos', JSON.stringify(savedCompos)); syncCompoSelects(); renderMesCompos(); 
    });
}

async function exportSettingsJson() {
    let data = { jediIdentity: localStorage.getItem('jediIdentity') || "", theme: localStorage.getItem('theme') || "", mixes: savedMixes, compos: savedCompos };
    let jsonStr = JSON.stringify(data, null, 2);
    let now = new Date(); let yy = now.getFullYear().toString().slice(-2);
    let start = new Date(now.getFullYear(), 0, 0); let diff = (now - start) + ((start.getTimezoneOffset() - now.getTimezoneOffset()) * 60 * 1000);
    let ddd = String(Math.floor(diff / (1000 * 60 * 60 * 24))).padStart(3, '0');
    let hh = String(now.getHours()).padStart(2, '0'); let mm = String(now.getMinutes()).padStart(2, '0');
    let filename = `jediy_${yy}${ddd}_${hh}${mm}.json`;

    try {
        if(window.showSaveFilePicker) {
            const handle = await window.showSaveFilePicker({ suggestedName: filename, types: [{ description: 'JSON', accept: {'application/json': ['.json']} }] });
            const writable = await handle.createWritable(); await writable.write(jsonStr); await writable.close(); 
            setNeedsExport(false);
            showAlert("Fichier sauvegardé !");
        } else {
            fallbackDownload(jsonStr, filename);
            setNeedsExport(false);
        }
    } catch(err) { 
        if(err.name !== 'AbortError') {
            fallbackDownload(jsonStr, filename);
            setNeedsExport(false);
        } 
    }
}

function fallbackDownload(jsonStr, filename) {
    let blob = new Blob([jsonStr], {type: "application/json"}); let a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); showAlert("Fichier téléchargé !");
}

function triggerImport() { document.getElementById('json_import_input').click(); }
function handleImport(e) {
    let file = e.target.files[0]; if(!file) return; let reader = new FileReader();
    reader.onload = function(ev) {
        try {
            let data = JSON.parse(ev.target.result);
            if(data.mixes) { savedMixes = data.mixes; localStorage.setItem('jediy_mixes', JSON.stringify(savedMixes)); }
            if(data.compos) { savedCompos = data.compos; localStorage.setItem('jediy_compos', JSON.stringify(savedCompos)); }
            if(data.jediIdentity !== undefined) { if(data.jediIdentity) localStorage.setItem('jediIdentity', data.jediIdentity); else localStorage.removeItem('jediIdentity'); }
            if(data.theme) localStorage.setItem('theme', data.theme);
            showAlert("Importation réussie !"); setTimeout(() => window.location.reload(), 1000);
        } catch(err) { showAlert("Fichier invalide !"); }
    };
    reader.readAsText(file); e.target.value = '';
}

/* ========================================== */
/* 11. EXPORT & PARTAGE (TEXTE, PDF, MODALES) */
/* ========================================== */

function openModalFromCard(element) {
    let card = element.classList.contains('recipe-card-wrapper') ? element : element.closest('.recipe-card-wrapper');
    currentMixCard = card; let clone = card.cloneNode(true);
    let optBtn = clone.querySelector('button'); if(optBtn) optBtn.remove();
    clone.classList.remove('hover:shadow-xl', 'hover:-translate-y-1', 'h-full', 'compact-card');
    clone.classList.add('export-card', 'relative', 'w-full', 'shadow-2xl', 'max-h-[85vh]', 'overflow-y-auto', 'hide-scrollbar');
    
    let isSaved = card.closest('#mes_mixes_list') !== null; let savedName = "";
    if (isSaved) { let nameBadge = card.parentElement.querySelector('.bg-brand-500'); if (nameBadge) savedName = nameBadge.innerText; }

    let nameInput = document.getElementById('mix_name_input');
    let saveWrapper = document.getElementById('save_mix_wrapper');
    let desc = document.getElementById('export_modal_desc');
    let cfgStr = clone.getAttribute('data-config'); let c = JSON.parse(decodeURIComponent(cfgStr));

    nameInput.style.display = 'block';

    if(isSaved) {
        saveWrapper.style.display = 'none'; 
        nameInput.value = savedName;
        desc.innerText = "Modifie le nom si besoin, puis exporte ou partage ton Mix.";
    } else {
        saveWrapper.style.display = 'block'; 
        nameInput.value = c.globalName || "";
        desc.innerText = "Donne un nom à ton Mix pour le sauvegarder ou l'exporter.";
    }
    toggleSaveMixBtn();
    
    let buttonsHtml = `
        <div class="modal-buttons flex justify-between gap-3 mt-6 pt-4 border-t border-stone-200 dark:border-stone-700 print:hidden">
            <button onclick="closeRecipeModal()" class="px-5 py-2.5 bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 text-stone-700 dark:text-stone-200 font-bold text-sm rounded-xl transition-colors">Fermer</button>
            <button onclick="openExportPrompt()" class="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white font-bold text-sm rounded-xl transition-colors shadow-sm flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg> Options de fiche
            </button>
        </div>`;
    clone.innerHTML += buttonsHtml;
    
    let sourceSimSel = card.querySelector('.sim-sel-vol');
    if(sourceSimSel) {
        let cloneSimSel = clone.querySelector('.sim-sel-vol'); cloneSimSel.value = sourceSimSel.value; handlePreleveChange(cloneSimSel);
        if(sourceSimSel.value === 'custom') clone.querySelector('.sim-custom-vol').value = card.querySelector('.sim-custom-vol').value;
    }
    let sourceBRatio = card.querySelector('.sim-b-ratio'); if(sourceBRatio) clone.querySelector('.sim-b-ratio').value = sourceBRatio.value;
    let sourceBCount = card.querySelector('.sim-b-count'); let sourceMlCount = card.querySelector('.sim-ml-count');
    if(sourceBCount) clone.querySelector('.sim-b-count').value = sourceBCount.value; if(sourceMlCount) clone.querySelector('.sim-ml-count').value = sourceMlCount.value;
    
    let modalContent = document.getElementById('recipe_modal_content'); modalContent.innerHTML = ''; modalContent.appendChild(clone);
    
    let themeWrapper = document.getElementById('recipe_modal_theme_wrapper'); 
    let themeToApply = card.closest('[data-theme]') ? card.closest('[data-theme]').getAttribute('data-theme') : card.getAttribute('data-theme');
    if(themeWrapper && themeToApply) themeWrapper.dataset.theme = themeToApply;
    
    document.getElementById('recipe_modal').classList.remove('hidden');
    let sel = clone.querySelector('.sim-sel-vol'); if(sel) updateSim(sel);
}

function closeRecipeModal() { document.getElementById('recipe_modal').classList.add('hidden'); currentMixCard = null; }
function showPdfOptions() { document.getElementById('export_step_1').classList.add('hidden'); document.getElementById('export_step_2').classList.remove('hidden'); document.getElementById('export_step_2').classList.add('flex'); document.getElementById('btn_back_export').classList.remove('hidden'); }
function hidePdfOptions() { document.getElementById('export_step_1').classList.remove('hidden'); document.getElementById('export_step_2').classList.add('hidden'); document.getElementById('export_step_2').classList.remove('flex'); document.getElementById('btn_back_export').classList.add('hidden'); }
function openExportPrompt() {
    if (pendingNewMix) { document.getElementById('mix_name_input').value = currentMixCard ? (JSON.parse(decodeURIComponent(currentMixCard.getAttribute('data-config'))).globalName || '') : ''; pendingNewMix = false; }
    if(document.getElementById('mix_name_input').style.display !== 'none') { toggleSaveMixBtn(); }
    document.getElementById('export_prompt_modal').classList.remove('hidden'); 
    if(document.getElementById('mix_name_input').style.display !== 'none') document.getElementById('mix_name_input').focus();
}
function cancelExport() { document.getElementById('export_prompt_modal').classList.add('hidden'); hidePdfOptions(); }

function getRecipeText() {
    if (!currentMixCard) return "";
    let name = document.getElementById('mix_name_input').value.trim() || "Mix"; let text = `🧪 ${name}\n-----------------\n`;
    let cfgStr = currentMixCard.getAttribute('data-config'); let c = JSON.parse(decodeURIComponent(cfgStr));
    
    let tVol = c.type === 't1' ? c.finalVol : (c.type === 't2' ? c.prepVol : (c.type === 'boost' ? c.vol + c.bVol : c.aVol + c.bVol + c.nVol));
    let ratio = c.type === 't3' ? (document.querySelector('.export-card').getAttribute('data-ratio') || 50) : (c.realPgRatio || c.pg || 50);

    text += `Volume: ${round1(tVol)} ml\n⚖️ Ratio : ${formatRatioStr(ratio, true)}\n`;
    text += `\n📝 INGRÉDIENTS :\n`;

    if (c.multi) {
        let originalText = c.originalCompoTotal ? ` (Recette originale: ${round1(c.originalCompoTotal)}%)` : '';
        text += `\n📝 COMPOSITION : ${c.compoName || 'Multi-arômes'}${originalText}\n`;
        let totalVol = (c.type === 't1' || c.type === 't2') ? c.finalVol : c.aVol;
        let tPerc = c.multi.reduce((acc, v)=>acc+v.perc,0);
        c.multi.forEach(i => {
            let v = totalVol * (i.perc/ (c.type === 't1' || c.type === 't2' ? 100 : tPerc));
            let w = getLiquidWeight(i.type, v, i.pg, i.degree);
            text += `- ${i.name} (${i.perc}%): ${round1(v)} ml (${round2(w)} g)\n`;
        });
    } else if (c.aroma !== undefined || c.aVol !== undefined) {
        let av = c.aroma || c.aVol; let aPg = c.aromaPg || c.aPg || 100;
        text += `- Arôme Concentré: ${round1(av)} ml (${round2(getWeight(av, aPg))} g)\n`;
    }

    if (c.bases) {
        c.bases.forEach(b => {
            if(b.vol > 0.1) text += `- Base ${formatRatioStr(b.pgRatio)}: ${round1(b.vol)} ml (${round2(getWeight(b.vol, b.pgRatio))} g)\n`;
        });
    } else if (c.bVol !== undefined && c.type === 't3') {
        text += `- Base ${formatRatioStr(c.bPg)}: ${round1(c.bVol)} ml (${round2(getWeight(c.bVol, c.bPg))} g)\n`;
    }

    if (c.nic > 0) {
        text += `- Booster ${formatRatioStr(c.nicRatio)}: ${round1(c.nic)} ml (${round2(getWeight(c.nic, c.nicRatio))} g)\n`;
    } else if (c.nVol > 0 && c.type === 't3') {
        text += `- Booster ${formatRatioStr(c.nPg)}: ${round1(c.nVol)} ml (${round2(getWeight(c.nVol, c.nPg))} g)\n`;
    } else if (c.type === 'boost' && c.bVol > 0) {
        text += `- Booster ${formatRatioStr(c.bPg)}: ${round1(c.bVol)} ml (${round2(getWeight(c.bVol, c.bPg))} g)\n`;
    }
    
    if (c.type === 't1' || c.type === 'boost' || c.type === 't3') {
        let aromaPerc = parseFloat(currentMixCard.getAttribute('data-aroma-perc')) || 0;
        let nicMg = parseFloat(currentMixCard.getAttribute('data-nic-mg')) || 0;
        let aromaStr = c.type === 'boost' ? 'Inconnu' : `${round1(aromaPerc)}%`; 
        text += `\n🎯 RÉSULTAT :\n- Arôme : ${aromaStr}\n- Nicotine : ${round1(nicMg)} mg/ml\n`;
    } else if (c.type === 't2') {
    let aromaBeforeBoost = c.prepVol > 0 ? (c.aroma / c.prepVol) * 100 : 0;
    let finalAromaPerc = c.finalVol > 0 ? (c.aroma / c.finalVol) * 100 : 0;
        text += `\n🎯 RÉSULTAT (Avant boost) :\n- Arôme surdosé : ${round1(aromaBeforeBoost)}%\n- Cibles après boost : ${round1(finalAromaPerc)}% d'arôme | ${round1(c.nicMax)} mg/ml max\n`;
        let bRatioSel = currentMixCard.querySelector('.sim-b-ratio'); let bPg = bRatioSel ? parseFloat(bRatioSel.value) : 50;
        
        function getGuideForVol(baseVol, title) {
            let baseWeight = getWeight(baseVol, ratio); let aromaVolInSample = baseVol * (c.aroma / c.prepVol);
            let out = `\n💡 GUIDE DE BOOST AVEC RATIO ${formatRatioStr(bPg)}\n(${title} - ${round2(baseWeight)} g) :\n`;
            let targets = [3, 6, 9, 12]; let sims = new Map();
            targets.forEach(target => {
                if (target < c.nicMax) {
                    let exactBVol = (baseVol * target) / (c.bStr - target); let bCount = Math.round(exactBVol / 10);
                    if (bCount > 0) {
                        let actualVol = bCount * 10; let actualNic = (actualVol * c.bStr) / (baseVol + actualVol); let fAroma = (aromaVolInSample / (baseVol + actualVol)) * 100; let fPg = ((baseVol * (ratio/100)) + (actualVol * (bPg/100))) / (baseVol + actualVol) * 100;
                        sims.set(bCount, {nic: actualNic, aroma: fAroma, pg: fPg});
                    }
                }
            });
            sims.forEach((data, bCount) => { let w = getWeight(bCount * 10, bPg); out += `+ ${bCount} boost. (${round1(bCount*10)}ml - ${round2(w)}g)\n  > Nic: ~${round1(data.nic)} mg\n  > Arôme: ~${round1(data.aroma)} %\n  > Ratio final: ~${formatRatioStr(data.pg)}\n`; });
            let exactMaxBVol = (baseVol * c.nicMax) / (c.bStr - c.nicMax); let maxBCount = exactMaxBVol / 10; let floorMax = Math.floor(maxBCount);
            if (floorMax > 0 && floorMax < maxBCount && !sims.has(floorMax)) {
                let actualNicFloor = (floorMax * 10 * c.bStr) / (baseVol + floorMax * 10); let fAromaFloor = (aromaVolInSample / (baseVol + floorMax * 10)) * 100; let fPgFloor = ((baseVol * (ratio/100)) + (floorMax * 10 * (bPg/100))) / (baseVol + floorMax * 10) * 100; let wFloor = getWeight(floorMax * 10, bPg);
                out += `+ ${floorMax} boost. (${round1(floorMax*10)}ml - ${round2(wFloor)}g)\n  > Nic: ~${round1(actualNicFloor)} mg\n  > Arôme: ~${round1(fAromaFloor)} %\n  > Ratio final: ~${formatRatioStr(fPgFloor)}\n`;
            }
            let maxAromaPerc = (aromaVolInSample / (baseVol + exactMaxBVol)) * 100; let maxFinalPg = ((baseVol * (ratio/100)) + (exactMaxBVol * (bPg/100))) / (baseVol + exactMaxBVol) * 100; let wMax = getWeight(maxBCount * 10, bPg);
            out += `+ MAX ${round1(maxBCount)} boost. (${round1(maxBCount*10)}ml - ${round2(wMax)}g)\n  > Nic: ${round1(c.nicMax)} mg\n  > Arôme: ${round1(maxAromaPerc)} %\n  > Ratio final: ~${formatRatioStr(maxFinalPg)}\n`;
            return out;
        }
        text += getGuideForVol(c.prepVol, "bidon complet " + round1(c.prepVol) + " ml"); if (50 < c.prepVol) text += getGuideForVol(50, "si prélèvement 50 ml");
    }
    if (jediIdentity) text += `\nCette composition aromatique vous est proposée par ${jediIdentity}\n`;
    text += `\n-----------------\nL'app Je-DIY :\nhttps://lehcimcramtrebor.github.io/jediy/`; return text;
}

function copyRecipeText() {
    let text = getRecipeText();
    navigator.clipboard.writeText(text).then(() => {
        let btn = document.getElementById('btn_copy_text'); let originalHtml = btn.innerHTML;
        btn.innerHTML = `<svg class="mb-2 text-brand-500" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg><span class="text-[10px] font-bold text-brand-500">Copié !</span>`;
        setTimeout(() => { btn.innerHTML = originalHtml; }, 2000);
    }).catch(err => console.error("Erreur copie", err));
}
function shareRecipeText() {
    let text = getRecipeText();
    if (navigator.share) navigator.share({ title: 'Mix E-Liquide', text: text }).catch((err) => console.log('Partage annulé', err));
    else copyRecipeText();
}

let generatedSignatures = new Set(); 

function computeBoostGuide(baseVol, totalAroma, prepVol, nicMax, bStr, basePg, bPg) {
    let aromaVolInSample = baseVol * (totalAroma / prepVol); let targets = [3, 6, 9, 12]; let sims = new Map();
    targets.forEach(target => {
        if (target < nicMax) {
            let exactBVol = (baseVol * target) / (bStr - target); let bCount = Math.round(exactBVol / 10);
            if (bCount > 0) {
                let actualVol = bCount * 10; let actualNic = (actualVol * bStr) / (baseVol + actualVol); let finalAromaPerc = (aromaVolInSample / (baseVol + actualVol)) * 100; let finalPg = ((baseVol * (basePg/100)) + (actualVol * (bPg/100))) / (baseVol + actualVol) * 100;
                sims.set(bCount, { nic: actualNic, aroma: finalAromaPerc, pg: finalPg });
            }
        }
    });
    let exactMaxBVol = (baseVol * nicMax) / (bStr - nicMax); let maxBCount = exactMaxBVol / 10; let floorMax = Math.floor(maxBCount);
    if (floorMax > 0 && floorMax < maxBCount && !sims.has(floorMax)) {
        let actualNicFloor = (floorMax * 10 * bStr) / (baseVol + floorMax * 10); let finalAromaPercFloor = (aromaVolInSample / (baseVol + floorMax * 10)) * 100; let finalPgFloor = ((baseVol * (basePg/100)) + (floorMax * 10 * (bPg/100))) / (baseVol + floorMax * 10) * 100;
        sims.set(floorMax, { nic: actualNicFloor, aroma: finalAromaPercFloor, pg: finalPgFloor, isFloorMax: true });
    }
    let maxAromaPerc = (aromaVolInSample / (baseVol + exactMaxBVol)) * 100; let maxFinalPg = ((baseVol * (basePg/100)) + (exactMaxBVol * (bPg/100))) / (baseVol + exactMaxBVol) * 100;
    sims.set(maxBCount, { nic: nicMax, aroma: maxAromaPerc, pg: maxFinalPg, isMax: true });
    let results = Array.from(sims, ([bCount, data]) => ({ bCount, ...data })); results.sort((a, b) => a.bCount - b.bCount); return results;
}

function getGuideHtmlForVol(baseVol, title, totalAroma, prepVol, bStr, nicMax, basePg, bPg) {
    let baseWeight = getWeight(baseVol, basePg); let data = computeBoostGuide(baseVol, totalAroma, prepVol, nicMax, bStr, basePg, bPg);
    let html = `
        <div class="p-3 bg-stone-50 border border-stone-200 rounded-xl text-stone-700 leading-tight break-inside-avoid h-full flex flex-col" style="font-size:10px;">
            <div class="font-black uppercase tracking-widest text-stone-500 mb-2 border-b border-stone-200 pb-1 flex items-center justify-between">
                <span>💡 ${title}</span><span class="bg-stone-200 px-1.5 py-0.5 rounded" style="font-size:8px;">${round1(baseVol)} ml (${round2(baseWeight)} g)</span>
            </div>
            <div class="flex-1 flex flex-col justify-center gap-1.5">`;
    data.forEach(row => {
        generatedSignatures.add(`${baseVol}-${row.bCount}`);
        let isMax = row.isMax; let warning = (row.nic > nicMax) ? `<span class="text-red-500 font-bold ml-1 bg-red-50 px-1 rounded border border-red-100" style="font-size:8px;">⚠️ Max</span>` : '';
        let trClass = isMax ? "text-brand-700 font-bold bg-brand-50 rounded px-1 -mx-1" : "text-stone-600"; 
        let prefix = isMax ? "MAX: " : "+ "; let mlText = round1(row.bCount * 10); let bWeight = getWeight(row.bCount * 10, bPg);
        
        html += `
            <div class="flex justify-between items-center border-b border-stone-200/50 last:border-0 pb-1.5 ${trClass}">
                <div class="flex flex-col">
                    <span class="font-bold">${prefix}${round1(row.bCount)} boost.</span>
                    <span class="opacity-70" style="font-size:8px;">(${mlText}ml - ${round2(bWeight)}g)</span>
                    <span class="text-brand-600 font-bold mt-0.5">-> ${isMax ? '' : '~'}${round1(row.nic)} mg</span>
                </div>
                <div class="flex flex-col items-end text-right" style="line-height:1.2;">
                    <span style="font-size:10px;">Arôme: ${isMax ? '' : '~'}${round1(row.aroma)}%</span>
                    <span class="text-stone-400 font-bold mt-0.5" style="font-size:8px;">Boosters: ${formatRatioStr(bPg)}</span>
                    <span class="text-stone-400 font-bold" style="font-size:8px;">Ratio final: ~${formatRatioStr(row.pg)}</span>
                    ${warning}
                </div>
            </div>`;
    });
    html += `</div></div>`; return html;
}

function prepareCardForExport() {
    let clone = document.getElementById('recipe_modal_content').querySelector('.export-card'); if (!clone) return null;
    
    clone.querySelectorAll('.truncate').forEach(el => {
        el.classList.remove('truncate');
        el.classList.add('break-words', 'whitespace-normal');
    });
    
    clone.classList.remove('max-h-[85vh]', 'overflow-y-auto', 'hide-scrollbar', 'shadow-2xl');
    clone.classList.add('border-2', 'border-stone-200', 'rounded-3xl', 'p-6');
    
    clone.style.width = '600px';
    clone.style.margin = '0 auto';
    clone.style.backgroundColor = '#ffffff';

    let aromaGrids = clone.querySelectorAll('.pdf-aroma-grid, .grid-cols-1.sm\\:grid-cols-2');
    aromaGrids.forEach(g => {
        g.classList.remove('grid-cols-1', 'sm:grid-cols-2');
        g.classList.add('grid-cols-3');
        if (g.parentElement.classList.contains('hidden')) g.parentElement.classList.remove('hidden');
    });

    let name = document.getElementById('mix_name_input').value.trim() || "Mix";
    let cfgStr = clone.getAttribute('data-config'); let c = JSON.parse(decodeURIComponent(cfgStr));
    
    let originalHeader = clone.querySelector('.flex-1 > div.flex.justify-between.items-start');
    if (originalHeader) originalHeader.style.display = 'none';
    
    let prepType = "";
    if (c.type === 't1') prepType = "Liquide Prêt";
    else if (c.type === 't2') prepType = "Base Shortfill";
    else if (c.type === 't3') prepType = "Mélange Manuel";
    else if (c.type === 'boost') prepType = "Mélange Boosté";

    let totalVol = c.type === 't1' ? c.finalVol : (c.type === 't2' ? c.prepVol : (c.type === 'boost' ? c.vol+c.bVol : c.aVol+c.bVol+c.nVol));
    let pgRatioNum = c.type === 't3' ? parseFloat(clone.getAttribute('data-ratio')) : (c.realPgRatio !== undefined ? c.realPgRatio : c.pg);
    let ratioStr = formatRatioStr(pgRatioNum || 50, true);

    let headerDiv = document.createElement('div'); headerDiv.className = 'export-title mb-5 border-b border-stone-200 pb-4 flex justify-between items-start';
    let qrcodeHtml = `<img src="jediy.png" alt="QR" class="w-14 h-14 rounded-xl shadow-sm border border-stone-200">`;
    let techHtml = `<div class="text-right flex flex-col items-end gap-1"><span class="inline-block font-black text-stone-800 bg-stone-100 px-2 py-0.5 rounded-md" style="font-size:11px; line-height:1.2;">${ratioStr}</span><span class="block text-brand-600 font-black text-base" style="font-size:16px; line-height:1.2;">${round1(totalVol)} ml</span></div>`;
    
    headerDiv.innerHTML = `
        <div class="flex-1 pr-4">
            <div class="text-2xl font-black text-stone-800 tracking-tight mb-1.5 pb-1" style="line-height:1.2;">${name}</div>
            <span class="inline-block bg-stone-100 px-2 py-1 rounded font-bold text-stone-500 uppercase tracking-widest" style="font-size:9px; line-height:1.2;">Je-DIY • ${prepType}</span>
        </div>
        <div class="flex gap-3 items-center">${techHtml}${qrcodeHtml}</div>
    `;
    clone.insertBefore(headerDiv, clone.firstChild);            
    
    let buttons = clone.querySelector('.modal-buttons'); if (buttons) buttons.style.display = 'none';

    let simContainer = clone.querySelector('.sim-container'); let cleanSimDiv = null;
    if (simContainer) {
        let type = clone.getAttribute('data-type');
        if (type === 't2') {
            let bStr = parseFloat(clone.getAttribute('data-booster-str')) || 20; let totalAroma = parseFloat(clone.getAttribute('data-aroma-vol')) || 0; let prepVolAttr = parseFloat(clone.getAttribute('data-prep-vol')) || 0; let maxNic = parseFloat(clone.getAttribute('data-nic-max')) || 0; let basePg = parseFloat(clone.getAttribute('data-base-pg')) || 50;
            let bRatioSel = clone.querySelector('.sim-b-ratio'); let bPg = bRatioSel ? parseFloat(bRatioSel.value) : 50;
            generatedSignatures.clear(); 
            
            cleanSimDiv = document.createElement('div'); cleanSimDiv.className = 'mt-4 grid grid-cols-2 gap-3 w-full pdf-guides';
            
            let defaultGuidesHtml = getGuideHtmlForVol(prepVolAttr, `Bidon Complet`, totalAroma, prepVolAttr, bStr, maxNic, basePg, bPg);
            if (prepVolAttr > 50) defaultGuidesHtml += getGuideHtmlForVol(50, "Prélèvement", totalAroma, prepVolAttr, bStr, maxNic, basePg, bPg);
            cleanSimDiv.innerHTML = defaultGuidesHtml;

            let sel = clone.querySelector('.sim-sel-vol'); let customPreleveVol = sel.value === 'custom' ? (parseFloat(clone.querySelector('.sim-custom-vol').value) || 0) : (parseFloat(sel.value) || 0); let customBCount = parseFloat(clone.querySelector('.sim-b-count').value) || 0;
            
            if (customPreleveVol > 0 && customBCount > 0) {
                let sig = `${customPreleveVol}-${customBCount}`;
                if (!generatedSignatures.has(sig)) {
                    let actualNic = (customBCount * 10 * bStr) / (customPreleveVol + customBCount * 10); let aromaVolInSample = customPreleveVol * (totalAroma / prepVolAttr); let finalAromaPerc = (aromaVolInSample / (customPreleveVol + customBCount * 10)) * 100; let customFinalPg = ((customPreleveVol * (basePg/100)) + (customBCount * 10 * (bPg/100))) / (customPreleveVol + customBCount * 10) * 100;
                    let warning = actualNic > maxNic; let customMlText = round1(customBCount * 10); let customBoostWeight = getWeight(customBCount * 10, bPg); let customBaseWeight = getWeight(customPreleveVol, basePg);
                    let customHtml = `
                    <div class="col-span-2 p-3 bg-stone-50 border border-stone-200 rounded-xl text-stone-700 leading-tight break-inside-avoid mt-1" style="font-size:10px;">
                        <div class="font-black uppercase tracking-widest text-stone-500 mb-2 border-b border-stone-200 pb-1 flex items-center gap-2"><span>💡 Personnalisé</span><span class="bg-stone-200 text-stone-700 px-1.5 py-0.5 rounded" style="font-size:8px;">${round1(customPreleveVol)} ml (${round2(customBaseWeight)} g)</span></div>
                        <div class="flex justify-between items-center">
                            <div class="flex flex-col">
                                <span class="font-bold">+ ${round1(customBCount)} boost.</span>
                                <span class="opacity-70" style="font-size:8px;">(${customMlText}ml - ${round2(customBoostWeight)}g)</span>
                                <span class="text-brand-600 font-bold mt-0.5">-> ~${round1(actualNic)} mg</span>
                            </div>
                            <div class="flex flex-col items-end text-right" style="line-height:1.2;">
                                <span style="font-size:10px;">Arôme: ~${round1(finalAromaPerc)}%</span>
                                <span class="text-stone-400 font-bold mt-0.5" style="font-size:8px;">Boosters: ${formatRatioStr(bPg)}</span>
                                <span class="text-stone-400 font-bold" style="font-size:8px;">Ratio final: ~${formatRatioStr(customFinalPg)}</span>
                                ${warning ? '<span class="text-red-500 font-bold mt-0.5 bg-red-50 px-1 rounded border border-red-100" style="font-size:8px;">⚠️ Max dépassé</span>' : ''}
                            </div>
                        </div>
                    </div>`;
                    cleanSimDiv.innerHTML += customHtml;
                }
            }
            simContainer.style.display = 'none'; simContainer.parentNode.insertBefore(cleanSimDiv, simContainer.nextSibling);
        }
    }

    let footerDiv = document.createElement('div'); footerDiv.className = 'export-footer mt-5 text-center border-t border-stone-200 pt-3';
    let footerText = jediIdentity ? `Mix partagé par <strong class="text-brand-600">${jediIdentity}</strong>` : `Généré avec Je-DIY - Le calculateur expert`;
    footerDiv.innerHTML = `<span class="text-stone-500 uppercase tracking-widest font-bold" style="font-size:9px;">${footerText}</span>`;
    clone.appendChild(footerDiv);
    
    document.documentElement.dataset.pdfTheme = document.getElementById('recipe_modal_theme_wrapper').dataset.theme;
    document.body.classList.add('exporting'); 
    document.documentElement.dataset.originalTheme = document.documentElement.dataset.theme;
    document.documentElement.dataset.theme = document.documentElement.dataset.pdfTheme;
    document.documentElement.classList.remove('dark');
    
    return {
        card: clone,
        restore: () => {
            document.body.classList.remove('exporting'); 
            document.documentElement.dataset.theme = document.documentElement.dataset.originalTheme;
            applyTheme(); 
            let addedTitle = clone.querySelector('.export-title'); if (addedTitle) addedTitle.remove();
            let addedFooter = clone.querySelector('.export-footer'); if (addedFooter) addedFooter.remove();
            clone.classList.remove('border-2', 'border-stone-200', 'rounded-3xl', 'p-6');
            clone.classList.add('max-h-[85vh]', 'overflow-y-auto', 'hide-scrollbar', 'shadow-2xl');
            clone.style.width = ''; clone.style.margin = ''; clone.style.backgroundColor = '';
            if (originalHeader) originalHeader.style.display = '';
            if (cleanSimDiv) cleanSimDiv.remove(); if (simContainer) simContainer.style.display = ''; if (buttons) buttons.style.display = ''; 
        }
    };
}

function exportRecipePDF(action) {
    let ctx = prepareCardForExport(); if (!ctx) return;
    let name = document.getElementById('mix_name_input').value.trim() || "mix";
    let filename = `${name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
    
    setTimeout(() => {
        let opt = {
            margin: [5, 5, 5, 5], filename: filename, image: { type: 'jpeg', quality: 0.95 },
            html2canvas: { scale: 2, useCORS: true, scrollY: 0, backgroundColor: '#ffffff', windowWidth: document.documentElement.offsetWidth },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }, pagebreak: { mode: 'avoid' } 
        };
        let worker = html2pdf().set(opt).from(ctx.card);

        if (action === 'download') {
            worker.save().then(() => { ctx.restore(); cancelExport(); }).catch(err => { console.error("Erreur PDF:", err); ctx.restore(); });
        } else if (action === 'share') {
            worker.output('blob').then(pdfBlob => {
                let file = new File([pdfBlob], filename, { type: 'application/pdf' });
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    navigator.share({ files: [file], title: name, text: 'Voici mon Mix E-Liquide généré avec Je-DIY.\nhttps://lehcimcramtrebor.github.io/jediy/' })
                    .then(() => { ctx.restore(); cancelExport(); }).catch(err => { console.log('Partage annulé', err); ctx.restore(); });
                } else {
                    alert("Le partage de fichier n'est pas supporté par votre navigateur. Le fichier va être téléchargé à la place.");
                    worker.save().then(() => { ctx.restore(); cancelExport(); });
                }
            }).catch(err => { console.error("Erreur Blob PDF:", err); ctx.restore(); });
        }
    }, 600);
}

function shareApp() { document.getElementById('share_flyer_modal').classList.remove('hidden'); closeSettingsModal(); }
function closeShareFlyerModal() { document.getElementById('share_flyer_modal').classList.add('hidden'); }

function executeShare() {
    let shareText = 'Découvre Je-DIY, le calculateur expert de e-liquide super pratique pour la vape !';
    if (jediIdentity) shareText = `Cette application a été partagée par ${jediIdentity}. ` + shareText;
    const shareData = { title: 'Je-DIY - Calculateur Expert', text: shareText, url: 'https://lehcimcramtrebor.github.io/jediy/' };

    if (navigator.share) navigator.share(shareData).catch((err) => console.log('Partage annulé ou erreur', err));
    else {
        const textArea = document.createElement("textarea"); textArea.value = shareData.url; document.body.appendChild(textArea); textArea.select();
        try {
            document.execCommand('copy');
            const btn = document.querySelector('.bg-brand-500.text-white.rounded-2xl'); const originalHTML = btn.innerHTML;
            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-white"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            setTimeout(() => { btn.innerHTML = originalHTML; }, 2000); closeShareFlyerModal();
        } catch (err) { console.error('Copie échouée', err); }
        document.body.removeChild(textArea);
    }
}

// Export PNG pour les Mixes/Recettes
function exportRecipePNG() {
    let ctx = prepareCardForExport(); if (!ctx) return;
    let name = document.getElementById('mix_name_input').value.trim() || "mix";
    let filename = `${name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.png`;
    
    let parent = ctx.card.parentNode;
    let nextSibling = ctx.card.nextSibling;
    
    // Création d'une page format A4
    let a4Wrapper = document.createElement('div');
    a4Wrapper.style.width = "794px"; // Largeur A4
    a4Wrapper.style.height = "1123px"; // Hauteur A4
    a4Wrapper.style.backgroundColor = "#ffffff";
    a4Wrapper.style.padding = "40px"; // Marges de la page
    a4Wrapper.style.boxSizing = "border-box";
    a4Wrapper.style.position = "absolute";
    a4Wrapper.style.left = "-9999px"; // Caché hors écran pendant la capture
    
    document.body.appendChild(a4Wrapper);
    a4Wrapper.appendChild(ctx.card);
    
    // Ajustements pour que la fiche se place bien en haut de la page A4
    let oldWidth = ctx.card.style.width;
    let oldMargin = ctx.card.style.margin;
    ctx.card.style.width = "100%";
    ctx.card.style.margin = "0";
    ctx.card.classList.remove('h-full'); // On retire l'étirement vertical
    
    setTimeout(() => {
        html2canvas(a4Wrapper, { scale: 2, useCORS: true, backgroundColor: '#ffffff', scrollY: 0 }).then(canvas => {
            let link = document.createElement('a');
            link.download = filename;
            link.href = canvas.toDataURL('image/png');
            link.click();
            
            // On remet la fiche à sa place d'origine
            if (nextSibling) {
                parent.insertBefore(ctx.card, nextSibling);
            } else {
                parent.appendChild(ctx.card);
            }
            
            a4Wrapper.remove();
            ctx.card.style.width = oldWidth;
            ctx.card.style.margin = oldMargin;
            ctx.card.classList.add('h-full');
            
            ctx.restore();
            cancelExport();
        });
    }, 600);
}


/* ========================================== */
/* 12. PWA ET SERVICE WORKER                  */
/* ========================================== */

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); deferredPrompt = e;
    updateSettingsBadge();
    let modalInstallBtn = document.getElementById('modal_install_btn');
    if (modalInstallBtn) { modalInstallBtn.classList.remove('hidden'); modalInstallBtn.classList.add('flex'); }
});

function installApp() {
    let modalInstallBtn = document.getElementById('modal_install_btn');
    if(modalInstallBtn) { modalInstallBtn.classList.add('hidden'); modalInstallBtn.classList.remove('flex'); }
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(() => { deferredPrompt = null; updateSettingsBadge(); });
    }
}

window.addEventListener('appinstalled', () => {
    let modalInstallBtn = document.getElementById('modal_install_btn');
    if (modalInstallBtn) { modalInstallBtn.classList.add('hidden'); modalInstallBtn.classList.remove('flex'); }
    updateSettingsBadge();
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => { navigator.serviceWorker.register('./sw.js').then(registration => { console.log('ServiceWorker enregistré.'); }).catch(error => { console.log('Erreur ServiceWorker:', error); }); });
}

function hardResetApp() {
    localStorage.clear();
    if ('caches' in window) caches.keys().then((names) => { for (let name of names) caches.delete(name); });
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => { for (let r of registrations) r.unregister(); }).then(() => { window.location.reload(true); });
    } else window.location.reload(true);
}