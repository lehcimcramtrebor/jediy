/* ========================================== */
/* 1. INITIALISATION ET VARIABLES GLOBALES    */
/* ========================================== */

const RATIOS = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0];
const DENSITY_PG = 1.036;
const DENSITY_VG = 1.261;

let state = { t1: { vol_mode: 'defined', nic_mode: 'mg' }, t2: { vol_mode: 'defined' } };
let calcExpr = ""; let pendingNewMix = false; 

const WIZ_PATH_MAIN = ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7'];
const ALL_WIZ_STEPS = ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7'];
let wizState = { step: 0, path: WIZ_PATH_MAIN, type: 't1', volMode: 'defined' };

let savedMixes = JSON.parse(localStorage.getItem('jediy_mixes') || '[]');
let currentMixCard = null;
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
    updateRatioDisp('t1'); updateRatioDisp('t2'); updateAromaPreview('t1'); updateAromaPreview('t2');
    triggerCalc(); wizUpdateView();
}
window.onload = () => { init(); };

/* ========================================== */
/* 2. FONCTIONS UTILITAIRES DE CALCUL         */
/* ========================================== */

function getWeight(vol, pgRatio) {
    if (vol <= 0) return 0;
    return (vol * (pgRatio / 100) * DENSITY_PG) + (vol * ((100 - pgRatio) / 100) * DENSITY_VG);
}
function formatRatioStr(pg, labels = false) {
    let p = Math.round(pg);
    if (p === 100) return labels ? "Full PG" : "100% PG";
    if (p === 0) return labels ? "Full VG" : "100% VG";
    return labels ? `${p}PG / ${100-p}VG` : `${p}/${100-p}`;
}
function round1(num) { return Math.round(num * 10) / 10; }
function round2(num) { return Math.round(num * 100) / 100; }
function getTheme(prefix) { return prefix === 't1' ? 'complet' : (prefix === 't2' ? 'shortfill' : (prefix === 'boost' ? 'boost' : 'manuel')); }

function adjustVal(id, step) {
    let el = document.getElementById(id); if(!el) return;
    let val = parseFloat(el.value) || 0;
    el.value = Math.max(0, val + step);
    let prefix = id.substring(0, 2); 
    if (prefix === 't1' || prefix === 't2') { updateAromaPreview(prefix); triggerCalc(); } 
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
    
    if (tabId === 'tab_mes_donnees') renderMesMixes(); else triggerCalc();
}

function toggleVolMode(prefix, mode) {
    state[prefix].vol_mode = mode;
    let btnDef = document.getElementById(`${prefix}_mode_vol_def`); let btnMax = document.getElementById(`${prefix}_mode_vol_max`);
    let activeClass = "flex-1 py-2 rounded-lg text-sm font-bold bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 shadow-sm transition-all";
    let inactiveClass = "flex-1 py-2 rounded-lg text-sm font-bold text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 transition-all";
    if(mode === 'defined') {
        btnDef.className = activeClass; btnMax.className = inactiveClass;
        document.getElementById(`${prefix}_vol_panel`).classList.remove('hidden'); document.getElementById(`${prefix}_aroma_avail_panel`).classList.add('hidden');
        document.getElementById(`${prefix}_vol_preview_container`).classList.add('hidden'); document.getElementById(`${prefix}_aroma_sync_wrapper`).classList.remove('hidden'); document.getElementById(`${prefix}_aroma_sync_wrapper`).classList.add('flex');
    } else {
        btnMax.className = activeClass; btnDef.className = inactiveClass;
        document.getElementById(`${prefix}_vol_panel`).classList.add('hidden'); document.getElementById(`${prefix}_aroma_avail_panel`).classList.remove('hidden');
        document.getElementById(`${prefix}_vol_preview_container`).classList.remove('hidden'); document.getElementById(`${prefix}_aroma_sync_wrapper`).classList.add('hidden'); document.getElementById(`${prefix}_aroma_sync_wrapper`).classList.remove('flex');
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
    else { let avail = parseFloat(document.getElementById('t1_aroma_avail').value) || 0; let perc = parseFloat(document.getElementById('t1_aroma_perc').value) || 0; if(perc > 0) finalVol = avail / (perc / 100); }
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
    let percEl = document.getElementById(`${prefix}_aroma_perc`);
    if(percEl) document.getElementById(`${prefix}_aroma_perc_disp`).innerText = `${percEl.value}%`;
    if(state[prefix].vol_mode === 'max_aroma') {
        let avail = parseFloat(document.getElementById(`${prefix}_aroma_avail`).value) || 0; let perc = parseFloat(document.getElementById(`${prefix}_aroma_perc`).value) || 0;
        if(perc > 0) {
            if(prefix === 't1') { let finalVol = avail / (perc / 100); document.getElementById('t1_vol_preview').innerText = `${round1(finalVol)} ml`; } 
            else if(prefix === 't2') {
                let finalVol = avail / (perc / 100); let maxNic = parseFloat(document.getElementById('t2_max_nic').value) || 0; let bStr = parseFloat(document.getElementById('t2_booster_str').value) || 20;
                let prepVol = finalVol - ((finalVol * maxNic) / bStr);
                document.getElementById('t2_vol_preview').innerText = `${round1(finalVol)} ml total`; document.getElementById('t2_vol_preview_sub').innerText = `soit ${round1(prepVol)} ml à préparer (avant boost)`;
            }
        } else document.getElementById(`${prefix}_vol_preview`).innerText = `Erreur %`;
    } else if (state[prefix].vol_mode === 'defined') {
        let syncInput = document.getElementById(`${prefix}_aroma_sync_ml`);
        if(syncInput) {
            let perc = parseFloat(percEl.value) || 0; let vol = 0;
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

/* ========================================== */
/* 4. MODE ASSISTANT (WIZARD)                 */
/* ========================================== */

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

function updateWizPreview() { document.getElementById('wiz_aroma_perc_disp').innerText = document.getElementById('wiz_aroma_perc').value + '%'; }

function runWizCalculation() {
    let prefix = wizState.type; toggleVolMode(prefix, wizState.volMode);
    if (wizState.volMode === 'defined') document.getElementById(prefix + '_vol').value = document.getElementById('wiz_vol').value;
    else document.getElementById(prefix + '_aroma_avail').value = document.getElementById('wiz_aroma_avail').value;
    document.getElementById(prefix + '_aroma_perc').value = document.getElementById('wiz_aroma_perc').value;

    let isAdvAroma = document.getElementById('wiz_adv_aroma').checked; let aromaPgVal = document.getElementById('wiz_aroma_pg').value;
    let tabAdvChk = document.getElementById(prefix + '_adv_aroma');
    if (tabAdvChk) {
        tabAdvChk.checked = isAdvAroma; toggleAdvAroma(prefix); 
        if (isAdvAroma) { document.getElementById(prefix + '_aroma_pg').value = aromaPgVal; document.getElementById(prefix + '_aroma_pg_val').innerText = formatRatioStr(100 - aromaPgVal, false); } 
        else { document.getElementById(prefix + '_aroma_pg').value = 0; document.getElementById(prefix + '_aroma_pg_val').innerText = '100% PG'; }
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
    document.getElementById('wiz_s7_title').innerText = "Et voilà le travail ! 🎉"; document.getElementById('wiz_s7_desc').innerText = "J'ai calculé les meilleures combinaisons avec ton matériel.";
    document.getElementById('wiz_res_tab_name').innerText = prefix === 't1' ? "Liquide Complet" : "Créer Shortfill"; document.getElementById('wiz_s7_info_block').classList.remove('hidden');
}


/* ========================================== */
/* 5. MOTEUR DE CALCUL CENTRAL                */
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

function buildBoostCardHtml(c, noBtn = false, isCompact = false) {
    let jWeight = getWeight(c.vol, c.pg); let bWeight = getWeight(c.bVol, c.bPg); let totalWeight = jWeight + bWeight;
    let finalVol = c.vol + c.bVol; let finalNic = finalVol > 0 ? (c.bVol * c.bStr) / finalVol : 0; let finalPgRatio = 50;
    if (c.advChecked) { let totalPgMl = (c.vol * (c.pg / 100)) + (c.bVol * (c.bPg / 100)); finalPgRatio = finalVol > 0 ? (totalPgMl / finalVol) * 100 : 50; }
    
    let cfgStr = encodeURIComponent(JSON.stringify(c)); let theme = 'boost'; let compactClass = isCompact ? "compact-card" : "";
    let btnHtml = !noBtn ? `<button onclick="openModalFromCard(this)" class="p-2 text-stone-400 dark:text-stone-400 hover:text-brand-600 dark:hover:text-brand-400 bg-white dark:bg-stone-700 hover:bg-stone-50 dark:hover:bg-stone-600 rounded-xl transition-all shadow-sm ring-1 ring-stone-200 dark:ring-stone-600" title="Agrandir la fiche"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"></path><path d="M9 21H3v-6"></path><path d="M21 3l-7 7"></path><path d="M3 21l7-7"></path></svg></button>` : '';

    let html = `<div data-theme="${theme}" data-config="${cfgStr}" data-type="boost" data-ratio="${finalPgRatio}" data-aroma-perc="Inconnu" data-nic-mg="${finalNic}" class="${compactClass} recipe-card-wrapper p-5 border border-brand-200 dark:border-brand-700 bg-brand-50 dark:bg-brand-900 rounded-3xl flex flex-col transition-all w-full h-full">
        <div class="flex-1">
            <div class="flex justify-between items-start mb-4 pb-3 border-b border-stone-200 dark:border-stone-700">
                <div>
                    <div class="font-extrabold text-stone-800 dark:text-stone-100 text-lg">Mélange Boosté <span class="text-brand-600">${round1(finalVol)} ml</span></div>
                    <div class="mt-1.5"><span class="text-xs font-bold text-brand-700 dark:text-brand-300 px-2 py-1 bg-white dark:bg-stone-800 rounded-lg shadow-sm">${formatRatioStr(finalPgRatio, true)}</span></div>
                </div>
                ${btnHtml}
            </div>
            <div class="card-body space-y-2 mb-4">`;
    if(c.vol > 0) {
        html += `<div class="flex justify-between items-center bg-white dark:bg-stone-800 p-2.5 rounded-xl shadow-sm border border-stone-100 dark:border-stone-700">
                    <span class="text-sm font-bold text-stone-600 dark:text-stone-300 flex items-center gap-2">Jus <span class="text-xs font-bold bg-stone-100 dark:bg-stone-700 px-1.5 py-0.5 rounded">${formatRatioStr(c.pg, false)}</span></span>
                    <div class="text-right leading-tight"><span class="font-black text-stone-800 dark:text-stone-100">${round1(c.vol)} ml</span><span class="block text-xs font-bold text-brand-600 mt-0.5">${round1(jWeight)} g</span></div>
                </div>`;
    }
    if(c.bVol > 0) {
        html += `<div class="flex justify-between items-center bg-white dark:bg-stone-800 p-2.5 rounded-xl shadow-sm border border-stone-100 dark:border-stone-700">
                    <span class="text-sm font-bold text-brand-600 dark:text-brand-400 flex items-center gap-2">Booster <span class="text-xs font-bold bg-brand-100 dark:bg-brand-900 px-1.5 py-0.5 rounded">${formatRatioStr(c.bPg, false)}</span></span>
                    <div class="text-right leading-tight"><span class="font-black text-stone-800 dark:text-stone-100">${round1(c.bVol)} ml <span class="text-[10px] text-stone-500 font-bold">(${round2(c.bVol/10)} u.)</span></span><span class="block text-xs font-bold text-brand-600 mt-0.5">${round1(bWeight)} g</span></div>
                </div>`;
    }
    html += `</div></div>
        <div class="mt-auto pt-4 border-t border-stone-200 dark:border-stone-700">
            <div class="flex justify-between items-center">
                <span class="text-xs font-bold text-stone-500 uppercase">Taux finaux</span>
                <div class="text-right"><span class="text-lg font-black text-brand-700 dark:text-brand-400">${round1(finalNic)} mg/ml</span></div>
            </div>
            <div class="text-right text-xs font-bold text-brand-600 dark:text-brand-400 mt-1">Poids total estimé : ${round1(totalWeight)} g</div>
        </div>
    </div>`;
    return html;
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
    if (advChecked) { if(jWeightEl) { jWeightEl.innerText = round1(jWeight) + " g"; jWeightEl.classList.remove('hidden'); } if(bWeightEl) { bWeightEl.innerText = round1(bWeight) + " g"; bWeightEl.classList.remove('hidden'); } } 
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
    let weightHtmlFinal = advChecked ? `<span class="text-base text-brand-600 dark:text-brand-400 font-black block mt-1">(${round1(totalWeight)} g)</span>` : '';

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

function calcTab1() {
    let finalVol, aromaVol; let aromaPgVal = parseInt(document.getElementById('t1_aroma_pg').value); let aromaPg = isNaN(aromaPgVal) ? 100 : (100 - aromaPgVal);
    if(state.t1.vol_mode === 'defined') {
        finalVol = parseFloat(document.getElementById('t1_vol').value) || 0; let p = parseFloat(document.getElementById('t1_aroma_perc').value) || 0; aromaVol = finalVol * (p/100);
    } else {
        aromaVol = parseFloat(document.getElementById('t1_aroma_avail').value) || 0; let p = parseFloat(document.getElementById('t1_aroma_perc').value) || 0;
        if(p <= 0) { renderMixes('t1', [], [{err: "Le pourcentage d'arôme doit être supérieur à 0."}]); return; }
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

    let targetPgMl = finalVol * (targetPgRatio / 100); let aromaPgMl = aromaVol * (aromaPg / 100);
    let exactRecipes = []; let altRecipes = [];

    for(let bPg of boostsAvail) {
        let boostPgMl = nicVol * (bPg / 100); let remainingPgNeeded = targetPgMl - aromaPgMl - boostPgMl;
        let mixes = findBaseMixes(baseVol, remainingPgNeeded, basesAvail);
        
        if(mixes) { for(let mix of mixes) exactRecipes.push({ aroma: aromaVol, aromaPg: aromaPg, nic: nicVol, nicRatio: bPg, bases: mix, finalVol: finalVol, realPgRatio: targetPgRatio, bStr }); } 
        else {
            let bestBase = basesAvail[0]; let minDiff = 9999;
            for(let bp of basesAvail) { let testPg = aromaPgMl + boostPgMl + (baseVol * (bp/100)); let diff = Math.abs(testPg - targetPgMl); if(diff < minDiff) { minDiff = diff; bestBase = bp; } }
            let realPg = ((aromaPgMl + boostPgMl + (baseVol * (bestBase/100))) / finalVol) * 100;
            altRecipes.push({ aroma: aromaVol, aromaPg: aromaPg, nic: nicVol, nicRatio: bPg, bases: [{pgRatio: bestBase, vol: baseVol}], finalVol: finalVol, realPgRatio: realPg, isAlt: true, bStr });
        }
    }
    renderMixes('t1', deduplicateMixes(exactRecipes), deduplicateMixes(altRecipes).sort((a,b) => Math.abs(a.realPgRatio - targetPgRatio) - Math.abs(b.realPgRatio - targetPgRatio)));
}

function calcTab2() {
    let finalVolAfterBoost, prepVol, aromaVol;
    let targetAromaPerc = parseFloat(document.getElementById('t2_aroma_perc').value) || 15;
    let maxNic = parseFloat(document.getElementById('t2_max_nic').value) || 0;
    let bStr = parseFloat(document.getElementById('t2_booster_str').value) || 20;

    if(state.t2.vol_mode === 'defined') {
        prepVol = parseFloat(document.getElementById('t2_vol').value) || 0;
        if(1 - maxNic/bStr <= 0) { renderMixes('t2', [], [{err: "Taux max nicotine impossible avec ce booster."}]); return; }
        finalVolAfterBoost = prepVol / (1 - maxNic/bStr); aromaVol = finalVolAfterBoost * (targetAromaPerc / 100);
    } else {
        aromaVol = parseFloat(document.getElementById('t2_aroma_avail').value) || 0;
        if(targetAromaPerc <= 0) { renderMixes('t2', [], [{err: "Pourcentage d'arôme > 0 requis."}]); return; }
        finalVolAfterBoost = aromaVol / (targetAromaPerc / 100);
        let boosterMaxVol = (finalVolAfterBoost * maxNic) / bStr; prepVol = finalVolAfterBoost - boosterMaxVol;
    }

    if(prepVol <= 0 || aromaVol > prepVol) { renderMixes('t2', [], [{err: "La concentration demandée ne laisse pas de place pour la base neutre !"}]); return; }

    let baseVol = prepVol - aromaVol; if (Math.abs(baseVol) < 1e-6) baseVol = 0; 
    let shortfillTargetPgRatio = 100 - parseInt(document.getElementById('t2_ratio_pg').value);
    let aromaPgVal = parseInt(document.getElementById('t2_aroma_pg').value); let aromaPg = isNaN(aromaPgVal) ? 100 : (100 - aromaPgVal);
    let shortfillTargetPgMl = prepVol * (shortfillTargetPgRatio / 100); let aromaPgMl = aromaVol * (aromaPg / 100);
    let remainingPgNeededInBase = shortfillTargetPgMl - aromaPgMl;
    let basesAvail = getChecked('t2_base_chk');
    if(basesAvail.length === 0) { renderMixes('t2', [], [{err: "Cochez au moins une base."}]); return; }

    let exactRecipes = []; let altRecipes = [];
    let mixes = findBaseMixes(baseVol, remainingPgNeededInBase, basesAvail);
    
    if(mixes) { for(let mix of mixes) exactRecipes.push({ aroma: aromaVol, aromaPg: aromaPg, bases: mix, prepVol: prepVol, finalVol: finalVolAfterBoost, realPgRatio: shortfillTargetPgRatio, nicMax: maxNic, bStr }); } 
    else {
        let bestBase = basesAvail[0]; let minDiff = 9999;
        for(let bp of basesAvail) { let testPg = aromaPgMl + (baseVol * (bp/100)); let diff = Math.abs(testPg - shortfillTargetPgMl); if(diff < minDiff) { minDiff = diff; bestBase = bp; } }
        let realPg = ((aromaPgMl + (baseVol * (bestBase/100))) / prepVol) * 100;
        altRecipes.push({ aroma: aromaVol, aromaPg: aromaPg, bases: [{pgRatio: bestBase, vol: baseVol}], prepVol: prepVol, finalVol: finalVolAfterBoost, realPgRatio: realPg, isAlt: true, nicMax: maxNic, bStr });
    }
    renderMixes('t2', deduplicateMixes(exactRecipes), deduplicateMixes(altRecipes).sort((a,b) => Math.abs(a.realPgRatio - shortfillTargetPgRatio) - Math.abs(b.realPgRatio - shortfillTargetPgRatio)));
}

function buildT3CardHtml(c, noBtn = false, isCompact = false) {
    let aWeight = getWeight(c.aVol, c.aPg); let bWeight = getWeight(c.bVol, c.bPg); let nWeight = getWeight(c.nVol, c.nPg);
    let tVol = c.aVol + c.bVol + c.nVol; let tWeight = aWeight + bWeight + nWeight;
    let pgRatio = 50; let aRatio = 0; let finalNic = 0;
    if(tVol > 0) {
        let totalPg = (c.aVol*(c.aPg/100)) + (c.bVol*(c.bPg/100)) + (c.nVol*(c.nPg/100));
        pgRatio = (totalPg / tVol) * 100; aRatio = (c.aVol / tVol) * 100; finalNic = (c.nVol * c.str) / tVol;
    }
    let cfgStr = encodeURIComponent(JSON.stringify(c)); let theme = 'manuel'; let compactClass = isCompact ? "compact-card" : "";
    let btnHtml = !noBtn ? `<button onclick="openModalFromCard(this)" class="p-2 text-stone-400 dark:text-stone-400 hover:text-brand-600 dark:hover:text-brand-400 bg-white dark:bg-stone-700 hover:bg-stone-50 dark:hover:bg-stone-600 rounded-xl transition-all shadow-sm ring-1 ring-stone-200 dark:ring-stone-600" title="Agrandir la fiche"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"></path><path d="M9 21H3v-6"></path><path d="M21 3l-7 7"></path><path d="M3 21l7-7"></path></svg></button>` : '';
    
    let html = `<div data-theme="${theme}" data-config="${cfgStr}" data-type="t3" data-ratio="${pgRatio}" data-aroma-perc="${aRatio}" data-nic-mg="${finalNic}" class="${compactClass} recipe-card-wrapper p-5 border border-brand-200 dark:border-brand-700 bg-brand-50 dark:bg-brand-900 rounded-3xl flex flex-col transition-all w-full h-full hover:shadow-xl hover:-translate-y-1 duration-300">
        <div class="flex-1">
            <div class="flex justify-between items-start mb-4 pb-3 border-b border-stone-200/60 dark:border-stone-700 transition-colors">
                <div>
                    <div class="font-extrabold text-stone-800 dark:text-stone-100 text-lg leading-tight">Mélange Manuel <span class="text-brand-600 dark:text-brand-400">${round1(tVol)} ml</span></div>
                    <div class="mt-1.5"><span class="text-xs font-bold text-brand-700 dark:text-brand-300 px-2 py-1 bg-white dark:bg-stone-800 rounded-lg shadow-sm transition-colors">${formatRatioStr(pgRatio, true)}</span></div>
                </div>
                ${btnHtml}
            </div>
            <div class="card-body space-y-2 mb-4">`;
    if (c.aVol > 0) {
        html += `<div class="flex justify-between items-center bg-white dark:bg-stone-800 p-2.5 rounded-xl shadow-sm border border-stone-100 dark:border-stone-700 transition-colors">
                    <span class="text-sm font-bold text-brand-600 dark:text-brand-400 flex items-center gap-2">Arôme <span class="text-xs font-bold text-brand-700 dark:text-brand-300 bg-brand-100 dark:bg-brand-900 px-1.5 py-0.5 rounded transition-colors">${formatRatioStr(c.aPg, false)}</span></span>
                    <div class="text-right leading-tight"><span class="font-black text-stone-800 dark:text-stone-100">${round1(c.aVol)} ml</span><span class="block text-xs font-bold text-brand-600 dark:text-brand-400 mt-0.5">${round1(aWeight)} g</span></div>
                </div>`;
    }
    if (c.bVol > 0) {
        html += `<div class="flex justify-between items-center bg-white dark:bg-stone-800 p-2.5 rounded-xl shadow-sm border border-stone-100 dark:border-stone-700 transition-colors">
                    <span class="text-sm font-bold text-stone-600 dark:text-stone-400 flex items-center gap-2">Base <span class="text-xs font-bold text-stone-600 dark:text-stone-300 bg-stone-100 dark:bg-stone-700 px-1.5 py-0.5 rounded transition-colors">${formatRatioStr(c.bPg, false)}</span></span>
                    <div class="text-right leading-tight"><span class="font-black text-stone-800 dark:text-stone-100">${round1(c.bVol)} ml</span><span class="block text-xs font-bold text-brand-600 dark:text-brand-400 mt-0.5">${round1(bWeight)} g</span></div>
                </div>`;
    }
    if (c.nVol > 0) {
        html += `<div class="flex justify-between items-center bg-white dark:bg-stone-800 p-2.5 rounded-xl shadow-sm border border-stone-100 dark:border-stone-700 transition-colors">
                    <span class="text-sm font-bold text-brand-600 dark:text-brand-500 flex items-center gap-2">Booster <span class="text-xs font-bold text-brand-700 dark:text-brand-300 bg-brand-100 dark:bg-brand-900 px-1.5 py-0.5 rounded transition-colors">${formatRatioStr(c.nPg, false)}</span></span>
                    <div class="text-right leading-tight"><span class="font-black text-stone-800 dark:text-stone-100">${round1(c.nVol)} ml <span class="text-[10px] text-stone-500 font-bold">(${round2(c.nVol/10)} u.)</span></span><span class="block text-xs font-bold text-brand-600 dark:text-brand-400 mt-0.5">${round1(nWeight)} g</span></div>
                </div>`;
    }
    html += `</div></div>
        <div class="mt-auto pt-4 border-t border-stone-200 dark:border-stone-700 transition-colors">
            <div class="flex justify-between items-center">
                <span class="text-xs font-bold text-stone-500 dark:text-stone-400 uppercase tracking-widest">Taux finaux</span>
                <div class="text-right"><span class="text-lg font-black text-brand-600 dark:text-brand-400">${round1(aRatio)}%</span> <span class="text-xs text-stone-400 mr-1">arôme</span> <span class="mx-1 text-stone-300 dark:text-stone-600">|</span> <span class="text-lg font-black text-brand-700 dark:text-brand-400">${round1(finalNic)} mg/ml</span></div>
            </div>
            <div class="text-right text-xs font-bold text-brand-600 dark:text-brand-400 mt-1">Poids total estimé : ${round1(tWeight)} g</div>
        </div>
    </div>`;
    return html;
}

function calcTab3() {
    let aVol = parseFloat(document.getElementById('t3_aroma_vol').value)||0; let aPgVal = parseFloat(document.getElementById('t3_aroma_pg').value); let aPg = isNaN(aPgVal) ? 100 : (100 - aPgVal);
    let bVol = parseFloat(document.getElementById('t3_base_vol').value)||0; let bPgVal = parseFloat(document.getElementById('t3_base_pg').value); let bPg = isNaN(bPgVal) ? 50 : (100 - bPgVal);
    let nVol = parseFloat(document.getElementById('t3_boost_vol').value)||0; let nPgVal = parseFloat(document.getElementById('t3_boost_pg').value); let nPg = isNaN(nPgVal) ? 50 : (100 - nPgVal);
    let strVal = parseFloat(document.getElementById('t3_boost_str').value); let str = isNaN(strVal) ? 20 : strVal;

    let aWeight = getWeight(aVol, aPg); let bWeight = getWeight(bVol, bPg); let nWeight = getWeight(nVol, nPg);
    document.getElementById('t3_aroma_w').innerText = `${round1(aWeight)} g`; document.getElementById('t3_base_w').innerText = `${round1(bWeight)} g`; document.getElementById('t3_boost_w').innerText = `${round1(nWeight)} g`;
    let tVol = aVol + bVol + nVol; let tWeight = aWeight + bWeight + nWeight;

    if(tVol === 0) { document.getElementById('t3_results').innerHTML = `<div class="animate-fade-in">Aucun volume.</div>`; return; }

    let totalPg = (aVol*(aPg/100)) + (bVol*(bPg/100)) + (nVol*(nPg/100));
    let pgRatio = (totalPg / tVol) * 100; let aRatio = (aVol / tVol) * 100; let finalNic = (nVol * str) / tVol;
    let c = { type: 't3', aVol, aPg, bVol, bPg, nVol, nPg, str };
    let hiddenCardHtml = `<div id="t3_hidden_card" class="hidden">${buildT3CardHtml(c, false, false)}</div>`;

    document.getElementById('t3_results').innerHTML = `
        <div class="animate-fade-in">
            <div class="text-sm font-bold text-brand-600 dark:text-brand-400 uppercase tracking-wider mb-2">Volume Total : <span class="text-2xl text-stone-800 dark:text-stone-100 block">${round1(tVol)} ml <span class="text-base text-brand-600 dark:text-brand-400 font-black">(${round1(tWeight)} g)</span></span></div>
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

/* ========================================== */
/* 6. AFFICHAGE ET GÉNÉRATION HTML DES CARTES */
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
    if(alt.length > 0 && alt[0].err) { container.innerHTML = `<div class="animate-fade-in col-span-full p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-2xl font-bold text-sm text-center shadow-inner">${alt[0].err}</div>`; return; }

    let allHtml = '';
    if (exact.length > 0 || alt.length > 0) { allHtml += `<div class="animate-fade-in col-span-full mb-2 p-4 bg-brand-50/50 dark:bg-brand-900/10 border border-brand-200 dark:border-brand-800/50 rounded-2xl flex items-center gap-3 text-sm text-stone-700 dark:text-stone-300 shadow-sm transition-colors"><span class="text-xl">💡</span><p><strong>Astuce :</strong> Clique sur l'icône <svg class="inline w-4 h-4 mx-0.5 text-stone-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"></path><path d="M9 21H3v-6"></path><path d="M21 3l-7 7"></path><path d="M3 21l7-7"></path></svg> pour ouvrir le Mix et accéder aux options de partage et sauvegarde.</p></div>`; }
    if(exact.length > 0) { allHtml += `<div class="animate-fade-in col-span-full text-xs font-black text-brand-600 dark:text-brand-500 uppercase tracking-widest mb-2 ml-2 flex items-center gap-2 mt-2"><span class="w-2 h-2 rounded-full bg-brand-500"></span> ${exact.length} Mix(es) Parfait(s)</div>`; exact.forEach(r => allHtml += buildCard(r, prefix, false, false, false)); }
    if(exact.length === 0 && alt.length > 0) { allHtml += `<div class="animate-fade-in col-span-full text-xs font-black text-amber-500 dark:text-amber-500 uppercase tracking-widest mb-2 ml-2 flex items-center gap-2 mt-2"><span class="w-2 h-2 rounded-full bg-amber-500"></span> Alternatives Proches</div>`; alt.slice(0,3).forEach(r => allHtml += buildCard(r, prefix, true, false, false)); }
    if(exact.length === 0 && alt.length === 0) { allHtml = `<div class="animate-fade-in col-span-full p-4 bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 border border-stone-200 dark:border-stone-700 rounded-2xl font-bold text-sm text-center shadow-inner transition-colors">Aucun Mix possible. Ajustez les paramètres.</div>`; }
    
    container.innerHTML = allHtml; container.querySelectorAll('select').forEach(s => updateSim(s));
}

function buildCard(r, prefix, isAlt, noBtn = false, isCompact = false) {
    let bColor = isAlt ? 'border-amber-200 dark:border-amber-700 bg-amber-50 dark:bg-amber-900' : 'border-brand-200 dark:border-brand-700 bg-brand-50 dark:bg-brand-900';
    let tColor = isAlt ? 'text-amber-700 dark:text-amber-400' : 'text-brand-700 dark:text-brand-400';
    let actualAromaPg = (r.aromaPg !== undefined && r.aromaPg !== null && !isNaN(r.aromaPg)) ? r.aromaPg : 100;
    let aromaWeight = getWeight(r.aroma, actualAromaPg); let totalWeight = aromaWeight;

    let cfg = { ...r, type: prefix, isAlt: isAlt };
    let dataAttrs = `data-type="${prefix}" data-ratio="${r.realPgRatio}" data-base-pg="${r.realPgRatio}" `;
    if (prefix === 't1') {
        let finalAroma = r.finalVol > 0 ? (r.aroma / r.finalVol) * 100 : 0;
        let bStr = r.bStr || parseFloat(document.getElementById('t1_booster_str').value) || 20;
        let finalNic = r.finalVol > 0 ? (r.nic * bStr) / r.finalVol : 0; dataAttrs += `data-aroma-perc="${finalAroma}" data-nic-mg="${finalNic}" `; cfg.bStr = bStr;
    } else if (prefix === 't2') {
        let finalAroma = r.finalVol > 0 ? (r.aroma / r.finalVol) * 100 : 0;
        let bStr = r.bStr || parseFloat(document.getElementById('t2_booster_str').value) || 20;
        dataAttrs += `data-aroma-perc="${finalAroma}" data-aroma-vol="${r.aroma}" data-nic-max="${r.nicMax}" data-prep-vol="${r.prepVol}" data-booster-str="${bStr}" `; cfg.bStr = bStr;
    }

    let cfgStr = encodeURIComponent(JSON.stringify(cfg)); let theme = prefix === 't1' ? 'complet' : 'shortfill'; let compactClass = isCompact ? "compact-card" : "";
    let btnHtml = !noBtn ? `<button onclick="openModalFromCard(this)" class="p-2 text-stone-400 dark:text-stone-400 hover:text-brand-600 dark:hover:text-brand-400 bg-white dark:bg-stone-700 hover:bg-stone-50 dark:hover:bg-stone-600 rounded-xl transition-all shadow-sm ring-1 ring-stone-200 dark:ring-stone-600" title="Agrandir la fiche"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"></path><path d="M9 21H3v-6"></path><path d="M21 3l-7 7"></path><path d="M3 21l7-7"></path></svg></button>` : '';

    let html = `<div data-theme="${theme}" data-config="${cfgStr}" ${dataAttrs} class="${compactClass} animate-fade-in p-5 border ${bColor} rounded-3xl shadow-lg hover:shadow-xl hover:-translate-y-1 duration-300 flex flex-col h-full recipe-card-wrapper transition-all">
        <div class="flex-1">
            <div class="flex justify-between items-start mb-4 pb-3 border-b border-stone-200 dark:border-stone-700 transition-colors">
                <div>
                    <div class="font-extrabold text-stone-800 dark:text-stone-100 text-lg leading-tight">${prefix==='t1'?'Liquide Prêt':'Base Shortfill'} <span class="text-brand-600 dark:text-brand-400">${round1(prefix==='t1'?r.finalVol:r.prepVol)} ml</span></div>
                    <div class="mt-1.5"><span class="text-xs font-bold ${tColor} px-2 py-1 bg-white dark:bg-stone-800 rounded-lg shadow-sm transition-colors">${formatRatioStr(r.realPgRatio, true)}</span></div>
                </div>
                ${btnHtml}
            </div>
            <div class="card-body space-y-2 mb-4">
                <div class="flex justify-between items-center bg-white dark:bg-stone-800 p-2.5 rounded-xl shadow-sm border border-stone-100 dark:border-stone-700 transition-colors">
                    <span class="text-sm font-bold text-brand-600 dark:text-brand-400 flex items-center gap-2">Arôme Concentré <span class="text-xs font-bold text-brand-700 dark:text-brand-300 bg-brand-100 dark:bg-brand-900 px-1.5 py-0.5 rounded transition-colors">${formatRatioStr(actualAromaPg, false)}</span></span>
                    <div class="text-right leading-tight"><span class="font-black text-stone-800 dark:text-stone-100">${round1(r.aroma)} ml</span><span class="block text-xs font-bold text-brand-600 dark:text-brand-400 mt-0.5">${round1(aromaWeight)} g</span></div>
                </div>`;
    
    r.bases.forEach(b => {
        if(b.vol > 0.1) {
            let baseWeight = getWeight(b.vol, b.pgRatio); totalWeight += baseWeight;
            html += `<div class="flex justify-between items-center bg-white dark:bg-stone-800 p-2.5 rounded-xl shadow-sm border border-stone-100 dark:border-stone-700 transition-colors">
                    <span class="text-sm font-bold text-stone-600 dark:text-stone-300 flex items-center gap-2">Base <span class="text-xs font-bold text-stone-600 dark:text-stone-300 bg-stone-100 dark:bg-stone-700 px-1.5 py-0.5 rounded transition-colors">${formatRatioStr(b.pgRatio, false)}</span></span>
                    <div class="text-right leading-tight"><span class="font-black text-stone-800 dark:text-stone-100">${round1(b.vol)} ml</span><span class="block text-xs font-bold text-brand-600 dark:text-brand-400 mt-0.5">${round1(baseWeight)} g</span></div>
                </div>`;
        }
    });

    if(prefix === 't1' && r.nic > 0) {
        let nicWeight = getWeight(r.nic, r.nicRatio); totalWeight += nicWeight;
        html += `<div class="flex justify-between items-center bg-white dark:bg-stone-800 p-2.5 rounded-xl shadow-sm border border-stone-100 dark:border-stone-700 transition-colors">
                <span class="text-sm font-bold text-brand-600 dark:text-brand-500 flex items-center gap-2">Booster <span class="text-xs font-bold text-brand-700 dark:text-brand-300 bg-brand-100 dark:bg-brand-900 px-1.5 py-0.5 rounded transition-colors">${formatRatioStr(r.nicRatio, false)}</span></span>
                <div class="text-right leading-tight"><span class="font-black text-stone-800 dark:text-stone-100">${round1(r.nic)} ml <span class="text-[10px] text-stone-500 font-bold">(${round2(r.nic/10)} u.)</span></span><span class="block text-xs font-bold text-brand-600 dark:text-brand-400 mt-0.5">${round1(nicWeight)} g</span></div>
            </div>`;
    }
    html += `</div></div>`; 

    if(prefix === 't1') {
        let bStr = r.bStr || parseFloat(document.getElementById('t1_booster_str').value) || 20;
        let finalNic = r.finalVol > 0 ? (r.nic * bStr) / r.finalVol : 0; let finalAroma = r.finalVol > 0 ? (r.aroma / r.finalVol) * 100 : 0;
        html += `<div class="mt-auto pt-4 border-t border-stone-200 dark:border-stone-700 transition-colors">
            <div class="flex justify-between items-center"><span class="text-xs font-bold text-stone-500 dark:text-stone-400 uppercase tracking-widest">Taux finaux</span><div class="text-right"><span class="text-lg font-black text-brand-600 dark:text-brand-400">${round1(finalAroma)}%</span> <span class="text-xs text-stone-400 mr-1">arôme</span> <span class="mx-1 text-stone-300 dark:text-stone-600">|</span> <span class="text-lg font-black ${tColor}">${round1(finalNic)} mg/ml</span></div></div>
            <div class="text-right text-xs font-bold text-brand-600 dark:text-brand-400 mt-1">Poids total estimé : ${round1(totalWeight)} g</div>
        </div>`;
    }

	if(prefix === 't2') {
			html += `<div class="mt-auto border-t border-stone-200 dark:border-stone-700 pt-3 text-right transition-colors"><span class="text-xs font-bold text-brand-600 dark:text-brand-400">Poids total estimé : ${round1(totalWeight)} g</span>`;
			if (isCompact) { let surconcentration = (r.aroma / r.prepVol) * 100; html += `<br><span class="text-[10px] font-bold text-stone-500 mt-1 block">Surconcentration arôme : ${round1(surconcentration)}%</span>`; }
			html += `</div>`;
			
			html += `<div class="sim-container mt-2 p-3 bg-white dark:bg-stone-800 rounded-xl text-stone-800 dark:text-stone-200 text-xs border border-stone-100 dark:border-stone-700 shadow-sm transition-colors" data-base-vol="${r.prepVol}" data-aroma-vol="${r.aroma}" data-max-nic="${r.nicMax}" data-bstr="${r.bStr||(parseFloat(document.getElementById('t2_booster_str').value)||20)}" data-base-pg="${r.realPgRatio}">
				<div class="flex items-center justify-center gap-2 mb-2 text-stone-500 dark:text-stone-400 font-bold text-[10px] uppercase tracking-widest border-b border-stone-200 dark:border-stone-700 pb-1.5 transition-colors"><span>🧪 Simulation d'ajout de boosters</span></div>
				<div class="flex flex-col items-center gap-0.5 mb-3">
					<span class="text-[10px] font-bold text-stone-500 dark:text-stone-400">Je prélève</span>
					<select onchange="handlePreleveChange(this)" class="sim-sel-vol w-full max-w-[180px] bg-stone-50 dark:bg-stone-900 text-stone-800 dark:text-white rounded p-1 text-xs font-bold focus:outline-none border border-stone-200 dark:border-stone-700 text-center shadow-inner transition-colors">`;
			[10, 20, 30, 40, 50, 60, 70, 80, 90, 100].forEach(v => { html += `<option value="${v}" ${v===50 ? 'selected' : ''}>${v} ml</option>`; });
			html += `   <option value="${r.prepVol}">Total (${round1(r.prepVol)}ml)</option><option value="custom">Manuel...</option></select>
					<div class="sim-custom-wrapper hidden items-center bg-stone-50 dark:bg-stone-900 rounded overflow-hidden border border-stone-200 dark:border-stone-700 shadow-inner mt-1 w-full max-w-[180px] transition-colors"><button onclick="adjustCustomPreleve(this, -1)" class="btn-adjust-xs">-</button><input type="number" class="sim-custom-vol hide-arrows flex-1 min-w-0 w-full h-7 bg-stone-50 dark:bg-stone-900 text-stone-800 dark:text-white text-center text-xs font-bold focus:outline-none transition-colors" placeholder="ml" value="50" oninput="updateSim(this)"><button onclick="adjustCustomPreleve(this, 1)" class="btn-adjust-xs">+</button></div>
					<div class="sim-preleve-weight text-[10px] text-brand-600 dark:text-brand-400 font-bold mt-1 text-center w-full"></div>
				</div>
				<div class="flex flex-col items-center mb-3 bg-stone-50 dark:bg-black/20 p-2 rounded-lg border border-stone-200 dark:border-stone-700 w-full max-w-[200px] mx-auto shadow-inner transition-colors">
					<div class="w-full flex justify-between items-center mb-2 px-1"><span class="text-[10px] font-bold text-stone-500 dark:text-stone-400">Ratio des boosters:</span><select class="sim-b-ratio bg-white dark:bg-stone-900 text-stone-800 dark:text-white rounded px-1 py-0.5 text-[10px] font-bold focus:outline-none border border-stone-200 dark:border-stone-700 text-center shadow-sm transition-colors" onchange="updateSim(this)"><option value="100">100% PG</option><option value="90">90/10</option><option value="80">80/20</option><option value="70">70/30</option><option value="60">60/40</option><option value="50" selected>50/50</option><option value="40">40/60</option><option value="30">30/70</option><option value="20">20/80</option><option value="10">10/90</option><option value="0">100% VG</option></select></div>
					<span class="text-[10px] font-bold text-stone-500 dark:text-stone-400 mb-1">J'ajoute</span>
					<div class="flex items-center bg-white dark:bg-stone-900 rounded overflow-hidden border border-stone-200 dark:border-stone-700 shadow-sm transition-colors"><button onclick="adjustSimBoosters(this, -1)" class="btn-adjust-xs">-</button><input type="number" value="2" step="0.1" min="0" oninput="syncSimInputs(this, 'boosters')" class="sim-b-count hide-arrows w-12 min-w-0 h-7 bg-white dark:bg-stone-900 text-stone-800 dark:text-white text-center text-xs font-bold focus:outline-none transition-colors"><button onclick="adjustSimBoosters(this, 1)" class="btn-adjust-xs">+</button></div>
					<span class="text-[10px] font-bold text-stone-500 dark:text-stone-400 mt-0.5">boosters</span><span class="text-[9px] font-black text-stone-400 dark:text-stone-500 uppercase tracking-widest my-1">ou</span>
					<div class="flex items-center bg-white dark:bg-stone-900 rounded overflow-hidden border border-stone-200 dark:border-stone-700 shadow-sm transition-colors"><button onclick="adjustSimMl(this, -1)" class="btn-adjust-xs">-</button><input type="number" value="20" step="1" min="0" oninput="syncSimInputs(this, 'ml')" class="sim-ml-count hide-arrows w-12 min-w-0 h-7 bg-white dark:bg-stone-900 text-stone-800 dark:text-white text-center text-xs font-bold focus:outline-none transition-colors"><button onclick="adjustSimMl(this, 1)" class="btn-adjust-xs">+</button></div>
					<span class="text-[10px] font-bold text-stone-500 dark:text-stone-400 mt-0.5">ml</span>
				</div>
				<div class="mt-3 text-center bg-stone-100 dark:bg-stone-900 p-2 rounded w-full border border-stone-200 dark:border-stone-700 transition-colors"><div class="text-[10px] font-bold text-stone-500 dark:text-stone-400">Résultat estimé :</div><div class="text-sm font-black text-brand-600 dark:text-brand-400 sim-result">...</div></div>
			</div>`;

    }
    html += `</div>`; return html;
}

/* ========================================== */
/* 7. SYSTÈME DE SIMULATION (SHORTFILL)       */
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

    if(preleveWeightEl) preleveWeightEl.innerText = preleveVol > 0 ? round1(getWeight(preleveVol, basePg)) + " g" : "";
    
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
/* 8. GESTION DES MODALES (AIDE, CALCULATRICE)*/
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
        if (!document.getElementById('recipe_modal').classList.contains('hidden')) { closeRecipeModal(); return; }
        if (!document.getElementById('help_modal').classList.contains('hidden')) { closeHelpModal(); return; }
        if (!document.getElementById('calc_modal').classList.contains('hidden')) { closeCalcModal(); return; }
        if (!document.getElementById('share_flyer_modal').classList.contains('hidden')) { closeShareFlyerModal(); return; }
        if (!document.getElementById('settings_modal').classList.contains('hidden')) { closeSettingsModal(); return; }
        if (!document.getElementById('reset_confirm_modal').classList.contains('hidden')) { closeResetConfirm(); return; }
    }
});

/* ========================================== */
/* MES DONNEES, SAUVEGARDES, IMPORT, EXPORT   */
/* ========================================== */

function updateSettingsBadge() {
    let gearBadge = document.getElementById('gear_badge');
    if(gearBadge) { if(deferredPrompt || unreadNotification) gearBadge.classList.remove('hidden'); else gearBadge.classList.add('hidden'); }
}

function openSettingsModal() { 
    unreadNotification = false; updateSettingsBadge();
    document.getElementById('settings_modal').classList.remove('hidden'); 
}
function closeSettingsModal() { document.getElementById('settings_modal').classList.add('hidden'); }
function openResetConfirm() { closeSettingsModal(); document.getElementById('reset_confirm_modal').classList.remove('hidden'); }
function closeResetConfirm() { document.getElementById('reset_confirm_modal').classList.add('hidden'); }
function showAlert(msg) { let m = document.getElementById('alert_modal'); document.getElementById('alert_text').innerText = msg; m.classList.remove('hidden'); setTimeout(() => m.classList.add('hidden'), 2500); }

function toggleSaveMixBtn() { 
    let val = document.getElementById('mix_name_input').value.trim(); let isValid = val.length >= 2;
    document.getElementById('btn_save_mix').disabled = !isValid;
    document.getElementById('btn_copy_text').disabled = !isValid;
    document.getElementById('btn_share_mix').disabled = !isValid;
    document.getElementById('btn_pdf_mix').disabled = !isValid;
}

function saveCurrentMix() {
    if(!currentMixCard) return;
    let cfgStr = currentMixCard.getAttribute('data-config'); if(!cfgStr) return;
    let cfg = JSON.parse(decodeURIComponent(cfgStr));
    let name = document.getElementById('mix_name_input').value.trim();
    savedMixes.push({ id: Date.now(), name: name, config: cfg });
    localStorage.setItem('jediy_mixes', JSON.stringify(savedMixes));
    unreadNotification = true; updateSettingsBadge();
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
    renderMesMixes();
}

function toggleGroupMixes() {
    groupMixes = !groupMixes;
    let btn = document.getElementById('btn_group_mixes');
    if (groupMixes) { btn.classList.add('bg-green-100', 'text-green-700', 'border-green-300', 'dark:bg-green-900/30', 'dark:text-green-400'); btn.classList.remove('bg-stone-100', 'text-stone-500', 'dark:bg-stone-800', 'dark:text-stone-400'); } 
    else { btn.classList.remove('bg-green-100', 'text-green-700', 'border-green-300', 'dark:bg-green-900/30', 'dark:text-green-400'); btn.classList.add('bg-stone-100', 'text-stone-500', 'dark:bg-stone-800', 'dark:text-stone-400'); }
    renderMesMixes();
}

function generateSavedMixHtml(m) {
    let c = m.config; let html = ''; let theme = getTheme(c.type);
    
    // Paramètres : (config, prefix/type, isAlt, noBtn = false, isCompact = true)
    if(c.type === 't1' || c.type === 't2') html = buildCard(c, c.type, c.isAlt, false, true);
    else if(c.type === 'boost') html = buildBoostCardHtml(c, false, true);
    else html = buildT3CardHtml(c, false, true);
    
    return `<div class="relative group mt-6 h-full w-full" data-theme="${theme}">
        <div class="absolute -top-3 left-4 z-10 bg-brand-500 text-white px-3 py-1 rounded-lg text-sm font-black shadow-md border-2 border-white dark:border-stone-800">${m.name}</div>
        <div class="absolute -top-4 right-4 z-10 flex gap-2">
            <button onclick="editMix(${m.id})" class="w-8 h-8 flex items-center justify-center bg-stone-800 dark:bg-stone-700 text-white rounded-lg shadow-sm border-2 border-white dark:border-stone-800 hover:bg-stone-700 transition-colors" title="Éditer">✏️</button>
            <button onclick="deleteMix(${m.id})" class="w-8 h-8 flex items-center justify-center bg-red-500 dark:bg-red-600 text-white rounded-lg shadow-sm border-2 border-white dark:border-stone-800 hover:bg-red-600 transition-colors" title="Supprimer">🗑️</button>
        </div>
        ${html}
    </div>`;
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

function editMix(id) {
    let m = savedMixes.find(x => x.id === id); if(!m) return; let c = m.config;
    if(c.type === 't1') {
        switchTab('tab_complet'); document.getElementById('t1_vol').value = c.finalVol; document.getElementById('t1_aroma_perc').value = (c.aroma/c.finalVol)*100;
        document.getElementById('t1_adv_aroma').checked = c.aromaPg !== 100; document.getElementById('t1_aroma_pg').value = 100 - c.aromaPg; document.getElementById('t1_ratio_pg').value = 100 - c.realPgRatio;
        let bStr = c.bStr || parseFloat(document.getElementById('t1_booster_str').value) || 20; document.getElementById('t1_nic_mg').value = round1((c.nic * bStr) / c.finalVol);
        toggleVolMode('t1','defined'); toggleAdvAroma('t1'); setNicMode('t1','mg');
    } else if (c.type === 't2') {
        switchTab('tab_booster'); document.getElementById('t2_vol').value = c.prepVol; document.getElementById('t2_aroma_perc').value = (c.aroma/c.finalVol)*100;
        document.getElementById('t2_max_nic').value = c.nicMax; document.getElementById('t2_adv_aroma').checked = c.aromaPg !== 100;
        document.getElementById('t2_aroma_pg').value = 100 - c.aromaPg; document.getElementById('t2_ratio_pg').value = 100 - c.realPgRatio; toggleVolMode('t2','defined'); toggleAdvAroma('t2');
    } else if (c.type === 'boost') {
        switchTab('tab_boost_simple'); document.getElementById('tab_boost_vol').value = c.vol; document.getElementById('tab_boost_ml').value = c.bVol;
        document.getElementById('tab_boost_str').value = c.bStr; document.getElementById('tab_boost_adv').checked = c.advChecked;
        if(c.advChecked) { document.getElementById('tab_boost_pg').value = 100 - c.pg; document.getElementById('tab_boost_bpg').value = 100 - c.bPg; }
        document.getElementById('tab_boost_adv_panel').classList.toggle('hidden', !c.advChecked); syncBoostSimple('ml');
    } else if (c.type === 't3') {
        switchTab('tab_manuel'); document.getElementById('t3_aroma_vol').value = c.aVol; document.getElementById('t3_aroma_pg').value = 100 - c.aPg;
        document.getElementById('t3_base_vol').value = c.bVol; document.getElementById('t3_base_pg').value = 100 - c.bPg; document.getElementById('t3_boost_vol').value = c.nVol;
        document.getElementById('t3_boost_pg').value = 100 - c.nPg; document.getElementById('t3_boost_str').value = c.str;
        document.getElementById('t3_aroma_pg_val').innerText = formatRatioStr(c.aPg, false); document.getElementById('t3_base_pg_val').innerText = formatRatioStr(c.bPg, false); document.getElementById('t3_boost_pg_val').innerText = formatRatioStr(c.nPg, false);
    }
    if(c.type === 't1' || c.type === 't2') {
        document.querySelectorAll(`.${c.type}_base_chk`).forEach(chk => { chk.checked = c.bases.some(b => b.pgRatio === parseInt(chk.value)); toggleCheckBtn(chk); });
        if(c.type === 't1') document.querySelectorAll('.t1_boost_chk').forEach(chk => { chk.checked = (c.nicRatio === parseInt(chk.value)); toggleCheckBtn(chk); });
    }
    triggerCalc(); window.scrollTo({top: 0, behavior: 'smooth'});
}

function deleteMix(id) { savedMixes = savedMixes.filter(x => x.id !== id); localStorage.setItem('jediy_mixes', JSON.stringify(savedMixes)); renderMesMixes(); }

async function exportSettingsJson() {
    let data = { jediIdentity: localStorage.getItem('jediIdentity') || "", theme: localStorage.getItem('theme') || "", mixes: savedMixes };
    let jsonStr = JSON.stringify(data, null, 2);
    
    // Création du nom exact (jediy_YYDDD_HHMM.json)
    let now = new Date();
    let yy = now.getFullYear().toString().slice(-2);
    let start = new Date(now.getFullYear(), 0, 0);
    let diff = (now - start) + ((start.getTimezoneOffset() - now.getTimezoneOffset()) * 60 * 1000);
    let oneDay = 1000 * 60 * 60 * 24;
    let day = Math.floor(diff / oneDay);
    let ddd = String(day).padStart(3, '0');
    let hh = String(now.getHours()).padStart(2, '0');
    let mm = String(now.getMinutes()).padStart(2, '0');
    let filename = `jediy_${yy}${ddd}_${hh}${mm}.json`;

    try {
        if(window.showSaveFilePicker) {
            const handle = await window.showSaveFilePicker({ suggestedName: filename, types: [{ description: 'JSON', accept: {'application/json': ['.json']} }] });
            const writable = await handle.createWritable(); await writable.write(jsonStr); await writable.close(); showAlert("Fichier sauvegardé !");
        } else fallbackDownload(jsonStr, filename);
    } catch(err) { if(err.name !== 'AbortError') fallbackDownload(jsonStr, filename); }
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
            if(data.jediIdentity !== undefined) { if(data.jediIdentity) localStorage.setItem('jediIdentity', data.jediIdentity); else localStorage.removeItem('jediIdentity'); }
            if(data.theme) localStorage.setItem('theme', data.theme);
            showAlert("Importation réussie !"); setTimeout(() => window.location.reload(), 1000);
        } catch(err) { showAlert("Fichier invalide !"); }
    };
    reader.readAsText(file); e.target.value = '';
}

/* ========================================== */
/* 9. EXPORT & PARTAGE (TEXTE, PDF, MODALES)  */
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

    nameInput.style.display = 'block';

    if(isSaved) {
        saveWrapper.style.display = 'none'; 
        nameInput.value = savedName;
        desc.innerText = "Modifie le nom si besoin, puis exporte ou partage ton Mix.";
        let btns = ['btn_copy_text', 'btn_share_mix', 'btn_pdf_mix']; btns.forEach(b => { let el = document.getElementById(b); if(el) el.disabled = false; });
    } else {
        saveWrapper.style.display = 'block'; 
        nameInput.value = "";
        desc.innerText = "Donne un nom à ton Mix pour le sauvegarder ou l'exporter.";
        toggleSaveMixBtn();
    }
    
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
    
    // Important : On transmet le thème à l'enveloppe de la modale !
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
    if (pendingNewMix) { document.getElementById('mix_name_input').value = ''; pendingNewMix = false; }
    if(document.getElementById('mix_name_input').style.display !== 'none') { toggleSaveMixBtn(); }
    document.getElementById('export_prompt_modal').classList.remove('hidden'); 
    if(document.getElementById('mix_name_input').style.display !== 'none') document.getElementById('mix_name_input').focus();
}
function cancelExport() { document.getElementById('export_prompt_modal').classList.add('hidden'); hidePdfOptions(); }

function getRecipeText() {
    if (!currentMixCard) return "";
    let name = document.getElementById('mix_name_input').value.trim() || "Mon Mix DIY"; let text = `🧪 ${name}\n-----------------\n`;
    let clone = document.getElementById('recipe_modal_content').querySelector('.export-card');
    let type = clone.getAttribute('data-type'); let ratio = clone.getAttribute('data-ratio');
    let aromaPerc = parseFloat(clone.getAttribute('data-aroma-perc')) || 0; let basePg = parseFloat(clone.getAttribute('data-base-pg')) || 50;
    let titleEl = clone.querySelector('.font-extrabold.text-lg');
    if(titleEl) text += `${titleEl.innerText.replace(/\n/g, ' ')}\n`; if (ratio) text += `⚖️ Ratio : ${formatRatioStr(ratio, true)}\n`;
    
    text += `\n📝 INGRÉDIENTS :\n`;
    let rows = clone.querySelectorAll('.bg-white.dark\\:bg-stone-800.p-2\\.5');
    rows.forEach(row => {
        let nameNode = row.querySelector('.text-sm'); let ingName = nameNode.innerText.replace(/\n/g, ' ').replace(' Concentré', '').trim();
        let vols = row.querySelector('.text-right').innerText.split('\n'); let ml = vols[0].trim(); let g = vols.length > 1 ? ` (${vols[1].trim()})` : ''; text += `- ${ingName}: ${ml}${g}\n`;
    });
    
    if (type === 't1' || type === 'boost') {
        let aromaStr = type === 'boost' ? 'Inconnu' : `${round1(aromaPerc)}%`; text += `\n🎯 RÉSULTAT :\n- Arôme : ${aromaStr}\n`;
        let nicMg = parseFloat(clone.getAttribute('data-nic-mg')) || 0; text += `- Nicotine : ${round1(nicMg)} mg/ml\n`;
    } else if (type === 't2') {
        let nicMax = parseFloat(clone.getAttribute('data-nic-max')) || 0; let prepVol = parseFloat(clone.getAttribute('data-prep-vol')) || 0; let bStr = parseFloat(clone.getAttribute('data-booster-str')) || 20; let totalAroma = parseFloat(clone.getAttribute('data-aroma-vol')) || 0;
        let aromaBeforeBoost = prepVol > 0 ? (totalAroma / prepVol) * 100 : 0;
        text += `\n🎯 RÉSULTAT (Avant boost) :\n- Arôme surdosé : ${round1(aromaBeforeBoost)}%\n- Cibles après boost : ${round1(aromaPerc)}% d'arôme | ${round1(nicMax)} mg/ml max\n`;
        let bRatioSel = clone.querySelector('.sim-b-ratio'); let bPg = bRatioSel ? parseFloat(bRatioSel.value) : 50;
        
        function getGuideForVol(baseVol, title) {
            let baseWeight = getWeight(baseVol, basePg); let aromaVolInSample = baseVol * (totalAroma / prepVol);
            let out = `\n💡 GUIDE DE BOOST AVEC RATIO ${formatRatioStr(bPg)}\n(${title} - ${round1(baseWeight)} g) :\n`;
            let targets = [3, 6, 9, 12]; let sims = new Map();
            targets.forEach(target => {
                if (target < nicMax) {
                    let exactBVol = (baseVol * target) / (bStr - target); let bCount = Math.round(exactBVol / 10);
                    if (bCount > 0) {
                        let actualVol = bCount * 10; let actualNic = (actualVol * bStr) / (baseVol + actualVol); let finalAromaPerc = (aromaVolInSample / (baseVol + actualVol)) * 100; let finalPg = ((baseVol * (basePg/100)) + (actualVol * (bPg/100))) / (baseVol + actualVol) * 100;
                        sims.set(bCount, {nic: actualNic, aroma: finalAromaPerc, pg: finalPg});
                    }
                }
            });
            sims.forEach((data, bCount) => { let w = getWeight(bCount * 10, bPg); out += `+ ${bCount} boost. (${round1(bCount*10)}ml - ${round1(w)}g)\n  > Nic: ~${round1(data.nic)} mg\n  > Arôme: ~${round1(data.aroma)} %\n  > Ratio final: ~${formatRatioStr(data.pg)}\n`; });
            let exactMaxBVol = (baseVol * nicMax) / (bStr - nicMax); let maxBCount = exactMaxBVol / 10; let floorMax = Math.floor(maxBCount);
            if (floorMax > 0 && floorMax < maxBCount && !sims.has(floorMax)) {
                let actualNicFloor = (floorMax * 10 * bStr) / (baseVol + floorMax * 10); let finalAromaPercFloor = (aromaVolInSample / (baseVol + floorMax * 10)) * 100; let finalPgFloor = ((baseVol * (basePg/100)) + (floorMax * 10 * (bPg/100))) / (baseVol + floorMax * 10) * 100; let wFloor = getWeight(floorMax * 10, bPg);
                out += `+ ${floorMax} boost. (${round1(floorMax*10)}ml - ${round1(wFloor)}g)\n  > Nic: ~${round1(actualNicFloor)} mg\n  > Arôme: ~${round1(finalAromaPercFloor)} %\n  > Ratio final: ~${formatRatioStr(finalPgFloor)}\n`;
            }
            let maxAromaPerc = (aromaVolInSample / (baseVol + exactMaxBVol)) * 100; let maxFinalPg = ((baseVol * (basePg/100)) + (exactMaxBVol * (bPg/100))) / (baseVol + exactMaxBVol) * 100; let wMax = getWeight(maxBCount * 10, bPg);
            out += `+ MAX ${round1(maxBCount)} boost. (${round1(maxBCount*10)}ml - ${round1(wMax)}g)\n  > Nic: ${round1(nicMax)} mg\n  > Arôme: ${round1(maxAromaPerc)} %\n  > Ratio final: ~${formatRatioStr(maxFinalPg)}\n`;
            return out;
        }
        text += getGuideForVol(prepVol, "bidon complet " + round1(prepVol) + " ml"); if (50 < prepVol) text += getGuideForVol(50, "si prélèvement 50 ml");
        let simSel = clone.querySelector('.sim-sel-vol'); let customPreleveVol = (simSel.value === 'custom') ? (parseFloat(clone.querySelector('.sim-custom-vol').value) || 0) : (parseFloat(simSel.value) || 0); let customBCount = parseFloat(clone.querySelector('.sim-b-count').value) || 0;
        if (customPreleveVol > 0 && customBCount > 0) {
            let actualNic = (customBCount * 10 * bStr) / (customPreleveVol + customBCount * 10); let aromaVolInSample = customPreleveVol * (totalAroma / prepVol); let finalAromaPerc = (aromaVolInSample / (customPreleveVol + customBCount * 10)) * 100; let customFinalPg = ((customPreleveVol * (basePg/100)) + (customBCount * 10 * (bPg/100))) / (customPreleveVol + customBCount * 10) * 100; let wCustom = getWeight(customBCount * 10, bPg);
            let customLine = `+ ${round1(customBCount)} boost. (${round1(customBCount*10)}ml - ${round1(wCustom)}g)\n  > Nic: ~${round1(actualNic)} mg\n  > Arôme: ~${round1(finalAromaPerc)} %\n  > Ratio final: ~${formatRatioStr(customFinalPg)}\n`;
            if (!text.includes(customLine)) { text += `\n💡 GUIDE PERSONNALISÉ RATIO ${formatRatioStr(bPg)}\n(pour ${round1(customPreleveVol)} ml) :\n${customLine}`; if (actualNic > nicMax) text += `⚠️ ATTENTION : Taux max dépassé !\n`; }
        }
    }
    if (jediIdentity) text += `\nCe Mix a été partagé par ${jediIdentity}\n`;
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
        <div class="p-3 bg-stone-50 border border-stone-200 rounded-xl text-stone-700 text-[10px] leading-tight break-inside-avoid">
            <div class="font-black uppercase tracking-widest text-stone-500 mb-1 border-b border-stone-200 pb-1 flex items-center gap-2">
                <span>💡 ${title}</span><span class="text-[8px] bg-stone-200 px-1.5 py-0.5 rounded">${round1(baseVol)} ml (${round1(baseWeight)} g)</span>
            </div>
            <table class="w-full text-left font-medium mt-1">`;
    data.forEach(row => {
        generatedSignatures.add(`${baseVol}-${row.bCount}`);
        let isMax = row.isMax; let warning = (row.nic > nicMax) ? `<span class="text-red-500 font-bold text-[8px] ml-1">⚠️ Max dépassé</span>` : '';
        let trClass = isMax ? "text-brand-700 font-bold" : "text-stone-600"; let prefix = isMax ? "MAX: " : "+ "; let mlText = round1(row.bCount * 10); let bWeight = getWeight(row.bCount * 10, bPg);
        html += `
            <tr class="${trClass} border-b border-stone-100/50 last:border-0">
                <td class="py-1 align-middle whitespace-nowrap pr-2">${prefix}${round1(row.bCount)} boost. <span class="text-[8px] opacity-70">(${mlText}ml - ${round1(bWeight)}g)</span></td>
                <td class="py-1 align-middle whitespace-nowrap pr-2">-> ${isMax ? '' : '~'}${round1(row.nic)} mg</td>
                <td class="py-1 align-middle text-right">Arôme: ${isMax ? '' : '~'}${round1(row.aroma)}%<br><span class="text-[8px] text-stone-400 font-bold">Boosters: ${formatRatioStr(bPg)}</span><br><span class="text-[8px] text-stone-400 font-bold">Ratio final: ~${formatRatioStr(row.pg)}</span> ${warning}</td>
            </tr>`;
    });
    html += `</table></div>`; return html;
}

function prepareCardForExport() {
    let clone = document.getElementById('recipe_modal_content').querySelector('.export-card'); if (!clone) return null;
    clone.classList.remove('max-h-[85vh]', 'overflow-y-auto', 'hide-scrollbar');
    let name = document.getElementById('mix_name_input').value.trim() || "Mix personnalisé";
    let headerDiv = document.createElement('div'); headerDiv.className = 'export-title text-center mb-3 pb-3 border-b-2 border-stone-200';
    headerDiv.innerHTML = `<div class="text-3xl font-black text-stone-800 tracking-tight mb-1">Je-<span class="text-brand-600">DIY</span></div><div class="text-lg font-bold text-stone-500">${name}</div>`;
    clone.insertBefore(headerDiv, clone.firstChild);            
    let buttons = clone.querySelector('.modal-buttons'); if (buttons) buttons.style.display = 'none';

    let simContainer = clone.querySelector('.sim-container'); let cleanSimDiv = null;
    if (simContainer) {
        let type = clone.getAttribute('data-type');
        if (type === 't2') {
            let bStr = parseFloat(clone.getAttribute('data-booster-str')) || 20; let totalAroma = parseFloat(clone.getAttribute('data-aroma-vol')) || 0; let prepVolAttr = parseFloat(clone.getAttribute('data-prep-vol')) || 0; let maxNic = parseFloat(clone.getAttribute('data-nic-max')) || 0; let basePg = parseFloat(clone.getAttribute('data-base-pg')) || 50;
            let bRatioSel = clone.querySelector('.sim-b-ratio'); let bPg = bRatioSel ? parseFloat(bRatioSel.value) : 50;
            generatedSignatures.clear(); 
            cleanSimDiv = document.createElement('div'); cleanSimDiv.className = 'mt-3 flex flex-col gap-2 w-full pdf-guides';
            let guidesHtml = getGuideHtmlForVol(prepVolAttr, `Bidon Complet (Boosters ${formatRatioStr(bPg)})`, totalAroma, prepVolAttr, bStr, maxNic, basePg, bPg);
            if (prepVolAttr > 50) guidesHtml += getGuideHtmlForVol(50, "Prélèvement", totalAroma, prepVolAttr, bStr, maxNic, basePg, bPg);
            let sel = clone.querySelector('.sim-sel-vol'); let customPreleveVol = sel.value === 'custom' ? (parseFloat(clone.querySelector('.sim-custom-vol').value) || 0) : (parseFloat(sel.value) || 0); let customBCount = parseFloat(clone.querySelector('.sim-b-count').value) || 0;
            
            if (customPreleveVol > 0 && customBCount > 0) {
                let sig = `${customPreleveVol}-${customBCount}`;
                if (!generatedSignatures.has(sig)) {
                    let actualNic = (customBCount * 10 * bStr) / (customPreleveVol + customBCount * 10); let aromaVolInSample = customPreleveVol * (totalAroma / prepVolAttr); let finalAromaPerc = (aromaVolInSample / (customPreleveVol + customBCount * 10)) * 100; let customFinalPg = ((customPreleveVol * (basePg/100)) + (customBCount * 10 * (bPg/100))) / (customPreleveVol + customBCount * 10) * 100;
                    let warning = actualNic > maxNic; let customMlText = round1(customBCount * 10); let customBoostWeight = getWeight(customBCount * 10, bPg); let customBaseWeight = getWeight(customPreleveVol, basePg);
                    guidesHtml += `
                    <div class="p-3 bg-stone-50 border border-stone-200 rounded-xl text-stone-700 text-[10px] leading-tight break-inside-avoid">
                        <div class="font-black uppercase tracking-widest text-stone-500 mb-1 border-b border-stone-200 pb-1 flex items-center gap-2"><span>💡 Personnalisé</span><span class="text-[8px] bg-stone-200 text-stone-700 px-1.5 py-0.5 rounded">${round1(customPreleveVol)} ml (${round1(customBaseWeight)} g)</span></div>
                        <table class="w-full text-left font-medium mt-1">
                            <tr class="border-b border-stone-100/50 last:border-0">
                                <td class="py-1 align-middle whitespace-nowrap pr-2">+ ${round1(customBCount)} boost. <span class="text-[8px] opacity-70">(${customMlText}ml - ${round1(customBoostWeight)}g)</span></td>
                                <td class="py-1 align-middle whitespace-nowrap pr-2">-> ~${round1(actualNic)} mg</td>
                                <td class="py-1 align-middle text-right">Arôme: ~${round1(finalAromaPerc)}%<br><span class="text-[8px] text-stone-400 font-bold">Boosters: ${formatRatioStr(bPg)}</span><br><span class="text-[8px] text-stone-400 font-bold">Ratio final: ~${formatRatioStr(customFinalPg)}</span>${warning ? '<span class="text-red-500 font-bold text-[8px] ml-1">⚠️ Max dépassé</span>' : ''}</td>
                            </tr>
                        </table>
                    </div>`;
                }
            }
            cleanSimDiv.innerHTML = guidesHtml; simContainer.style.display = 'none'; simContainer.parentNode.insertBefore(cleanSimDiv, simContainer.nextSibling);
        }
    }

    let footerDiv = document.createElement('div'); footerDiv.className = 'export-footer flex items-center justify-center gap-4 mt-6 pt-4 border-t-2 border-stone-100';
    let footerText = jediIdentity ? `Ce Mix a été partagé par <span class="text-brand-600 font-black text-base">${jediIdentity}</span>` : `Scanne ce code pour réaliser tes propres calculs<br><span class="text-brand-600 font-black text-base">Je-DIY</span>`;
    footerDiv.innerHTML = `<img src="jediy.png" alt="QR Code Je-DIY" class="w-20 h-20 rounded-xl shadow-sm border border-stone-200" onerror="this.src='https://placehold.co/80x80/e2e8f0/475569?text=Je-DIY'"><div class="text-stone-500 font-bold text-xs text-left leading-tight">${footerText}</div>`;
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
            clone.classList.add('max-h-[85vh]', 'overflow-y-auto', 'hide-scrollbar');
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
    }, 300);
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

/* ========================================== */
/* 10. PWA ET SERVICE WORKER                  */
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