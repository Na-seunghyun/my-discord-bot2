(function () {
  const SOURCE_DATA = window.KINGSHOT_MASTER_SOURCE || { meta: {}, masters: {} };
  const SOURCE_CLASS_NAMES = SOURCE_DATA.meta?.classNames || [
    "Stranger",
    "Acquaintance 1",
    "Acquaintance 2",
    "Acquaintance 3",
    "Casual 1",
    "Casual 2",
    "Casual 3",
    "Close 1",
    "Close 2",
    "Close 3",
    "Kindred Soul"
  ];
  const IMAGE_ROOT = "https://kingshot.net/images";
  const MATERIAL_IMAGES = {
    affinity: [`${IMAGE_ROOT}/masters/affinity.png`, `${IMAGE_ROOT}/masters/master-affinity.png`, `${IMAGE_ROOT}/items/affinity.png`],
    emblems: [`${IMAGE_ROOT}/masters/emblem.png`, `${IMAGE_ROOT}/masters/emblems.png`, `${IMAGE_ROOT}/items/master-emblem.png`],
    manuscripts: [`${IMAGE_ROOT}/items/masters-manuscript.png`, `${IMAGE_ROOT}/masters/manuscript.png`, `${IMAGE_ROOT}/masters/manuscripts.png`, `${IMAGE_ROOT}/items/master-manuscript.png`],
    time: [`${IMAGE_ROOT}/icons/time.png`, `${IMAGE_ROOT}/resources/time.png`],
    power: [`${IMAGE_ROOT}/icons/power.png`, `${IMAGE_ROOT}/resources/power.png`],
    buff: [`${IMAGE_ROOT}/icons/buff.png`, `${IMAGE_ROOT}/resources/buff.png`]
  };
  const MASTER_META = {
    valora: { initials: "VA" },
    pan: { initials: "PA" },
    roman: { initials: "RO" },
    cassia: { initials: "CA" },
    guinevere: { initials: "GU" },
    wilson: { initials: "WI" }
  };
  const SUPPORTED = ["ko", "ja", "en", "fr", "de", "zh-CN", "zh-TW", "th", "id"];
  const I18N = {
    en: {
      brandSub: "Kingshot calculator tools",
      hub: "Hub",
      calcHub: "Calculator Hub",
      eyebrow: "Master Calculator",
      title: "Master Calculator",
      subtitle: "Pick a Master, set your current and target snapshot, and instantly see Affinity, Emblems, Master's Manuscripts, learning time, Power, and squad buff gain.",
      statMasters: "Masters",
      statLevel: "Expert level",
      statBuff: "Max buff",
      pickMaster: "Pick a Master",
      pickDesc: "Choose a Master, then tune the plan below.",
      compare: "Compare",
      plan: "Plan",
      planDesc: "Set your current state on the left of each row and your target on the right.",
      maxPower: "Max power",
      maxBuff: "Max buff",
      expertLevel: "Expert level",
      relationshipClass: "Relationship class",
      talent: "Talent",
      talentPassive: "Passive talent. Always active.",
      skills: "Skills",
      skillsDesc: "Set skill levels exactly like the source calculator.",
      current: "Current",
      target: "Target",
      learnedXp: "Learned XP toward next level",
      learnedXpHelp: "Subtracted from the time estimate. Manuscripts are paid up-front per level and are not affected.",
      stock: "Stock",
      stockDesc: "Optional. We subtract what you already have from the requirement.",
      stockAffinity: "Affinity in stock",
      stockEmblems: "Emblems in stock",
      stockManuscripts: "Master's Manuscripts in stock",
      calculate: "Calculate",
      maxTargets: "Max",
      reset: "Reset",
      sourceNote: "Uses the public Kingshot.net Master calculator data table. Check in game before spending rare materials.",
      results: "Results",
      resultsDesc: "Required resources for this plan.",
      affinity: "Affinity",
      emblems: "Emblems",
      manuscripts: "Manuscripts",
      time: "Time to learn",
      xp: "XP",
      powerGain: "Power gain",
      buffGain: "Squad buff gain",
      stillNeed: "still needed",
      extra: "extra",
      skillBreakdown: "Manuscripts by skill",
      noSkillSelection: "No skill upgrades selected.",
      locked: "Locked",
      required: "required",
      levelShort: "Lv"
    },
    ko: {
      brandSub: "킹샷 계산기 도구",
      hub: "허브",
      calcHub: "계산기 허브",
      eyebrow: "마스터 계산기",
      title: "마스터 계산기",
      subtitle: "마스터를 선택하고 현재/목표 상태를 설정하면 친밀도, 엠블럼, 마스터 원고, 학습 시간, 전투력, 부대 버프 증가량을 바로 확인할 수 있습니다.",
      statMasters: "마스터",
      statLevel: "전문가 레벨",
      statBuff: "최대 버프",
      pickMaster: "마스터 선택",
      pickDesc: "마스터를 선택한 뒤 아래 계획을 조정하세요.",
      compare: "비교",
      plan: "계획",
      planDesc: "각 항목의 왼쪽은 현재 상태, 오른쪽은 목표 상태입니다.",
      maxPower: "최대 전투력",
      maxBuff: "최대 버프",
      expertLevel: "전문가 레벨",
      relationshipClass: "관계 등급",
      talent: "특성",
      talentPassive: "항상 적용되는 패시브 특성입니다.",
      skills: "스킬",
      skillsDesc: "원본 계산기처럼 스킬 레벨을 정확히 설정합니다.",
      current: "현재",
      target: "목표",
      learnedXp: "다음 레벨까지 이미 학습한 XP",
      learnedXpHelp: "학습 시간에서만 차감됩니다. 원고는 레벨마다 선불로 필요하므로 줄어들지 않습니다.",
      stock: "보유 재고",
      stockDesc: "선택 사항입니다. 보유량을 필요량에서 차감합니다.",
      stockAffinity: "보유 친밀도",
      stockEmblems: "보유 엠블럼",
      stockManuscripts: "보유 마스터 원고",
      calculate: "계산",
      maxTargets: "최대",
      reset: "초기화",
      sourceNote: "Kingshot.net 공개 마스터 계산기 데이터표를 기준으로 계산합니다. 희귀 재료 사용 전 게임 내 수치를 한 번 더 확인하세요.",
      results: "결과",
      resultsDesc: "이 계획에 필요한 재료입니다.",
      affinity: "친밀도",
      emblems: "엠블럼",
      manuscripts: "원고",
      time: "학습 시간",
      xp: "XP",
      powerGain: "전투력 증가",
      buffGain: "부대 버프 증가",
      stillNeed: "부족",
      extra: "남음",
      skillBreakdown: "스킬별 원고",
      noSkillSelection: "선택된 스킬 업그레이드가 없습니다.",
      locked: "잠김",
      required: "필요",
      levelShort: "Lv"
    },
    ja: {
      brandSub: "Kingshot計算ツール",
      hub: "ハブ",
      calcHub: "計算機ハブ",
      eyebrow: "マスター計算機",
      title: "マスター計算機",
      subtitle: "マスターを選び、現在値と目標値を設定すると、親密度、エンブレム、原稿、学習時間、戦力、部隊バフ増加量を確認できます。",
      statMasters: "マスター",
      statLevel: "専門家レベル",
      statBuff: "最大バフ",
      pickMaster: "マスター選択",
      pickDesc: "マスターを選び、下の計画を調整してください。",
      compare: "比較",
      plan: "計画",
      planDesc: "左が現在、右が目標です。",
      maxPower: "最大戦力",
      maxBuff: "最大バフ",
      expertLevel: "専門家レベル",
      relationshipClass: "関係クラス",
      talent: "才能",
      talentPassive: "常時有効なパッシブ才能です。",
      skills: "スキル",
      skillsDesc: "元の計算機と同じようにスキルレベルを設定します。",
      current: "現在",
      target: "目標",
      learnedXp: "次レベルまでの学習済みXP",
      learnedXpHelp: "学習時間から差し引かれます。原稿数には影響しません。",
      stock: "在庫",
      stockDesc: "持っている分を必要量から差し引きます。",
      stockAffinity: "在庫の親密度",
      stockEmblems: "在庫のエンブレム",
      stockManuscripts: "在庫のマスター原稿",
      calculate: "計算",
      maxTargets: "最大",
      reset: "リセット",
      sourceNote: "Kingshot.netの公開マスター計算データ表を基準にしています。",
      results: "結果",
      resultsDesc: "この計画に必要な素材です。",
      affinity: "親密度",
      emblems: "エンブレム",
      manuscripts: "原稿",
      time: "学習時間",
      xp: "XP",
      powerGain: "戦力増加",
      buffGain: "部隊バフ増加",
      stillNeed: "不足",
      extra: "余り",
      skillBreakdown: "スキル別原稿",
      noSkillSelection: "選択されたスキル強化はありません。",
      locked: "ロック",
      required: "必要",
      levelShort: "Lv"
    }
  };
  I18N.fr = {
    ...I18N.en,
    title: "Calculateur Master",
    subtitle: "Choisissez un Master et définissez l'état actuel et cible pour voir les ressources, le temps, la puissance et le bonus.",
    current: "Actuel",
    target: "Cible",
    calculate: "Calculer",
    results: "Résultats",
    stillNeed: "manquant",
    extra: "reste"
  };
  I18N.de = {
    ...I18N.en,
    title: "Master-Rechner",
    subtitle: "Wähle einen Master und setze aktuellen Zustand und Ziel, um Ressourcen, Zeit, Macht und Buff zu sehen.",
    current: "Aktuell",
    target: "Ziel",
    calculate: "Berechnen",
    results: "Ergebnisse",
    stillNeed: "fehlt",
    extra: "übrig"
  };
  I18N["zh-CN"] = {
    ...I18N.en,
    title: "大师计算器",
    subtitle: "选择大师并设置当前与目标状态，查看亲密度、徽章、手稿、学习时间、战力和部队增益。",
    current: "当前",
    target: "目标",
    calculate: "计算",
    results: "结果",
    stillNeed: "仍需",
    extra: "剩余"
  };
  I18N["zh-TW"] = {
    ...I18N.en,
    title: "大師計算器",
    subtitle: "選擇大師並設定目前與目標狀態，查看親密度、徽章、手稿、學習時間、戰力與部隊增益。",
    current: "目前",
    target: "目標",
    calculate: "計算",
    results: "結果",
    stillNeed: "仍需",
    extra: "剩餘"
  };
  I18N.th = {
    ...I18N.en,
    title: "เครื่องคิด Master",
    subtitle: "เลือก Master แล้วตั้งค่าปัจจุบันและเป้าหมายเพื่อดูทรัพยากร เวลา พลัง และบัฟ",
    current: "ปัจจุบัน",
    target: "เป้าหมาย",
    calculate: "คำนวณ",
    results: "ผลลัพธ์",
    stillNeed: "ยังขาด",
    extra: "เหลือ"
  };
  I18N.id = {
    ...I18N.en,
    title: "Kalkulator Master",
    subtitle: "Pilih Master dan atur kondisi saat ini serta target untuk melihat resource, waktu, power, dan buff.",
    current: "Saat ini",
    target: "Target",
    calculate: "Hitung",
    results: "Hasil",
    stillNeed: "kurang",
    extra: "sisa"
  };

  const params = new URLSearchParams(location.search);
  const normalizeLang = (value) => {
    const raw = String(value || "");
    const lower = raw.toLowerCase();
    if (lower === "zh-cn" || lower === "zh") return "zh-CN";
    if (lower === "zh-tw") return "zh-TW";
    const short = lower.split("-")[0];
    return SUPPORTED.includes(raw) ? raw : SUPPORTED.includes(short) ? short : "ko";
  };
  let lang = normalizeLang(params.get("lang") || localStorage.getItem("siteLang") || localStorage.getItem("lang") || navigator.language);
  const $ = (id) => document.getElementById(id);
  const locale = () => ({ ko: "ko-KR", ja: "ja-JP", en: "en-US", fr: "fr-FR", de: "de-DE", "zh-CN": "zh-CN", "zh-TW": "zh-TW", th: "th-TH", id: "id-ID" }[lang] || "en-US");
  const fmt = (value, digits = 0) => Number(value || 0).toLocaleString(locale(), { maximumFractionDigits: digits });
  const sourceFmt = (value, isPercent = false) => {
    const number = Number(value);
    const label = Number.isFinite(number) ? number.toLocaleString("en-US", { maximumFractionDigits: 2 }) : String(value ?? "");
    return `${label}${isPercent ? "%" : ""}`;
  };
  const cleanDesc = (text) => String(text || "")
    .replace(/<color=[^>]+>/gi, "")
    .replace(/<\/color>/gi, "")
    .replace(/<hyl=[^>]+>/gi, "")
    .replace(/<\/hyl>/gi, "")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const shortFallback = (text) => String(text || "M").split(/\s+/).map((part) => part[0]).join("").slice(0, 3).toUpperCase();
  const byNumber = (rows, key, value) => (rows || []).find((row) => Number(row[key]) === Number(value));
  const lastOf = (rows) => (rows || [])[Math.max(0, (rows || []).length - 1)] || {};
  const recordAt = (rows, key, value) => Number(value) <= 0 ? {} : byNumber(rows, key, value) || lastOf(rows);
  const sumSkillXp = (levels, from, to) => (levels || []).reduce((sum, row) => Number(row.level) > Number(from) && Number(row.level) <= Number(to) ? sum + Number(row.expNeed || 0) : sum, 0);
  const hydrateDesc = (entry, level) => {
    const row = recordAt(entry.levels, "level", level || entry.maxLevel);
    return cleanDesc(entry.desc).replace(/%\{n(\d+)\}/g, (_, index) => sourceFmt(row.values?.[Number(index) - 1], entry.isShowPercent?.[Number(index) - 1]));
  };
  const classNameFromRows = (rows, value) => recordAt(rows, "class", value).name || SOURCE_CLASS_NAMES[Math.max(0, Number(value) - 1)] || `Class ${value}`;
  const makeSkill = (skillId, skill) => {
    const max = Number(skill.maxLevel || lastOf(skill.levels).level || 0);
    const maxRow = recordAt(skill.levels, "level", max);
    return {
      id: skillId,
      name: skill.name,
      max,
      image: `${skillId}.png`,
      desc: hydrateDesc(skill, max),
      levels: skill.levels || [],
      requires: skill.requires || {},
      manuscripts: Number(maxRow.cumulativeManuscriptCost || 0),
      xp: sumSkillXp(skill.levels, 0, max),
      power: Number(maxRow.cumulativePower || 0)
    };
  };
  const MASTERS = Object.entries(SOURCE_DATA.masters || {}).map(([id, data]) => {
    const classes = data.classes || [];
    const levels = data.levels || [];
    const talentLevels = data.talent?.levels || [];
    const classOne = recordAt(classes, "class", 1);
    const classMax = recordAt(classes, "class", 11);
    const levelOne = recordAt(levels, "level", 1);
    const levelMax = recordAt(levels, "level", 100);
    const talentMax = lastOf(talentLevels);
    const skills = Object.entries(data.skills || {})
      .sort((a, b) => Number(a[1].slot || 0) - Number(b[1].slot || 0))
      .map(([skillId, skill]) => makeSkill(skillId, skill));
    const totalPower = Number(data.totals?.totalPower || (Number(classMax.cumulativePower || 0) + Number(levelMax.cumulativePower || 0) + Number(talentMax.cumulativePower || 0) + skills.reduce((sum, skill) => sum + skill.power, 0)));
    const maxBuff = (Number(classMax.buffValue || 0) + Number(levelMax.buffValue || 0)) / 100;
    const baseBuff = (Number(classOne.buffValue || 0) + Number(levelOne.buffValue || 0)) / 100;
    return {
      id,
      name: data.name,
      role: data.type,
      initials: MASTER_META[id]?.initials || shortFallback(data.name),
      classes,
      levels,
      talentLevels,
      totals: data.totals || {},
      talent: {
        id: data.talent?.id || "talent",
        name: data.talent?.name || "Talent",
        image: `${data.talent?.id || "talent"}.png`,
        max: Number(data.talent?.maxLevel || talentMax.level || 0),
        desc: hydrateDesc(data.talent || {}, Number(data.talent?.maxLevel || talentMax.level || 0))
      },
      skills,
      buff: maxBuff,
      baseBuff,
      fullBuffGain: Math.max(0, maxBuff - baseBuff),
      power: totalPower,
      affinity: Math.max(0, Number(levelMax.needAffinity || 0) - Number(levelOne.needAffinity || 0)),
      emblems: Number(classMax.cumulativeEmblemCost || 0),
      manuscripts: Number(data.totals?.manuscriptTotal || skills.reduce((sum, skill) => sum + skill.manuscripts, 0))
    };
  });
  let activeMaster = MASTERS[0]?.id || "";
  const t = (key) => I18N[lang]?.[key] || I18N.en[key] || key;
  const imageSources = (src) => (Array.isArray(src) ? src : [src]).filter(Boolean);
  const imageWrap = (src, alt, fallback, cls = "") => {
    const sources = imageSources(src);
    return `<span class="image-wrap ${cls}"><img src="${sources[0] || ""}" alt="${alt}" loading="lazy" data-fallback="${fallback}" data-src-list='${JSON.stringify(sources.slice(1))}'><span class="image-fallback">${fallback}</span></span>`;
  };
  const master = () => MASTERS.find((item) => item.id === activeMaster) || MASTERS[0];
  const classAt = (item, value) => recordAt(item.classes, "class", value);
  const levelAt = (item, value) => recordAt(item.levels, "level", value);
  const talentAt = (item, value) => Number(value) <= 0 ? {} : recordAt(item.talentLevels, "level", value);
  const skillAt = (skill, value) => Number(value) <= 0 ? {} : recordAt(skill.levels, "level", value);
  const classNameAt = (item, value) => classNameFromRows(item.classes, value);
  const masterImage = (item) => `${IMAGE_ROOT}/masters/${item.id}/${item.id}.png`;
  const skillImage = (item, skill) => skill.image ? `${IMAGE_ROOT}/masters/${item.id}/${skill.image}` : masterImage(item);
  const talentImage = (item) => [`${IMAGE_ROOT}/masters/${item.id}/${item.talent.image}`, `${IMAGE_ROOT}/masters/${item.id}/${item.talent.id}.png`, masterImage(item)];
  const materialImage = (key, item = master()) => key === "emblems" ? [`${IMAGE_ROOT}/masters/${item.id}/${item.id}-emblem.png`, ...MATERIAL_IMAGES.emblems] : MATERIAL_IMAGES[key];
  const bindImageFallback = (root = document) => {
    root.querySelectorAll("img[data-fallback]").forEach((img) => {
      if (img.dataset.boundFallback) return;
      img.dataset.boundFallback = "1";
      img.addEventListener("error", () => {
        const nextSources = JSON.parse(img.dataset.srcList || "[]");
        if (nextSources.length) {
          img.dataset.srcList = JSON.stringify(nextSources.slice(1));
          img.src = nextSources[0];
          return;
        }
        img.closest(".image-wrap,.avatar,.portrait-lg")?.classList.add("missing");
      });
    });
  };
  const parseAmount = (value) => {
    const raw = String(value || "0").trim().replace(/,/g, "").toLowerCase();
    const match = raw.match(/^(-?\d+(?:\.\d+)?)([kmb])?$/);
    if (!match) return Number(raw) || 0;
    const mult = match[2] === "k" ? 1e3 : match[2] === "m" ? 1e6 : match[2] === "b" ? 1e9 : 1;
    return Number(match[1]) * mult;
  };
  const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || min));
  const timeText = (seconds) => {
    seconds = Math.max(0, Math.round(seconds || 0));
    const d = Math.floor(seconds / 86400);
    const h = Math.floor((seconds % 86400) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d) return `~${d}d ${h}h`;
    if (h) return `~${h}h ${m}m`;
    return `~${m}m`;
  };
  const valueLabel = (id, value, max = 100) => {
    const item = master();
    if (id.includes("Class")) return `${classNameAt(item, clamp(value, 1, 11))} · ${clamp(value, 1, 11)}/11`;
    if (id.includes("Talent")) return `${clamp(value, 0, max)}/${max}`;
    if (id.startsWith("skill_")) return `${clamp(value, 0, max)}/${max}`;
    return `${t("levelShort")} ${clamp(value, 1, max)}/${max}`;
  };
  const control = (id, label, min, max, value) => `
    <div class="range-control">
      <div class="range-top"><span>${label}</span><output id="${id}Out">${valueLabel(id, value, max)}</output></div>
      <div class="range-pair">
        <input id="${id}Range" data-pair="${id}" type="range" min="${min}" max="${max}" value="${value}">
        <input id="${id}" data-pair="${id}" type="number" min="${min}" max="${max}" value="${value}">
      </div>
    </div>
  `;
  const planRow = (title, summary, current, target, min, max, currentValue, targetValue, icon = "") => `
    <article class="plan-row">
      <div class="row-title">${icon}<strong>${title}</strong><span>${summary}</span></div>
      ${control(current, t("current"), min, max, currentValue)}
      ${control(target, t("target"), min, max, targetValue)}
    </article>
  `;
  const requirementLabel = (item, skill) => {
    const req = skill.requires || {};
    const parts = [];
    if (req.class) parts.push(`${classNameAt(item, req.class)} ${t("required")}`);
    if (req.expertLevel) parts.push(`${t("levelShort")} ${req.expertLevel} ${t("required")}`);
    return parts.length ? `${t("locked")} · ${parts.join(" · ")}` : "";
  };
  function renderStatic() {
    document.documentElement.lang = lang;
    $("languageSelect").value = lang;
    document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
    $("hubLink").href = `./index.html?lang=${encodeURIComponent(lang)}`;
    $("hubTop").href = $("hubLink").href;
    $("calcLink").href = `./troop_training_ui.html?lang=${encodeURIComponent(lang)}`;
    renderStockLabels();
  }
  function renderStockLabels() {
    $("stockAffinityLabel").innerHTML = `${imageWrap(materialImage("affinity"), t("stockAffinity"), "AF")}<span>${t("stockAffinity")}</span>`;
    $("stockEmblemsLabel").innerHTML = `${imageWrap(materialImage("emblems"), t("stockEmblems"), "EM")}<span>${t("stockEmblems")}</span>`;
    $("stockManuscriptsLabel").innerHTML = `${imageWrap(materialImage("manuscripts"), t("stockManuscripts"), "MS")}<span>${t("stockManuscripts")}</span>`;
    bindImageFallback(document);
  }
  function renderMasters() {
    $("masters").innerHTML = MASTERS.map((item) => `
      <button type="button" class="master-card ${item.id === activeMaster ? "active" : ""}" data-master="${item.id}">
        <span class="avatar"><img src="${masterImage(item)}" alt="${item.name}" loading="lazy" data-fallback="${item.initials}"><span class="image-fallback">${item.initials}</span></span>
        <strong>${item.name}</strong>
        <span>${item.role}</span>
        <span class="badge">+${fmt(item.buff, 2)}%</span>
      </button>
    `).join("");
    document.querySelectorAll("[data-master]").forEach((button) => button.addEventListener("click", () => {
      activeMaster = button.dataset.master;
      renderAll();
    }));
    bindImageFallback($("masters"));
  }
  function renderSelectedMaster() {
    const item = master();
    $("selectedMaster").innerHTML = `
      <span class="portrait-lg"><img src="${masterImage(item)}" alt="${item.name}" loading="lazy" data-fallback="${item.initials}"><span class="image-fallback">${item.initials}</span></span>
      <div class="selected-copy">
        <h2>${item.name}</h2>
        <p>${item.role}</p>
        <div class="summary-grid">
          <span class="metric-pill">${t("maxBuff")} <strong>+${fmt(item.buff, 2)}%</strong></span>
          <span class="metric-pill">${t("maxPower")} <strong>${fmt(item.power)}</strong></span>
          <span class="metric-pill">${t("levelShort")} 1 · ${classNameAt(item, 1)} &rarr; ${t("levelShort")} 100 · ${classNameAt(item, 11)}</span>
        </div>
      </div>
    `;
    bindImageFallback($("selectedMaster"));
  }
  function renderPlanRows() {
    const item = master();
    $("planRows").innerHTML = [
      planRow(t("expertLevel"), `${t("levelShort")} 1 &rarr; 100`, "currentExpert", "targetExpert", 1, 100, 1, 100),
      planRow(t("relationshipClass"), `${classNameAt(item, 1)} &rarr; ${classNameAt(item, 11)}`, "currentClass", "targetClass", 1, 11, 1, 11),
      planRow(t("talent"), `0 &rarr; ${item.talent.max} · ${t("talentPassive")}`, "currentTalent", "targetTalent", 0, item.talent.max, 0, item.talent.max, imageWrap(talentImage(item), item.talent.name, shortFallback(item.talent.name), "skill-img"))
    ].join("");
    const talentDetail = document.createElement("p");
    talentDetail.className = "note";
    talentDetail.textContent = item.talent.desc;
    $("planRows").appendChild(talentDetail);
  }
  function renderSkills() {
    const item = master();
    $("skills").innerHTML = item.skills.map((skill, index) => {
      const requirement = requirementLabel(item, skill);
      return `
      <article class="skill" data-skill="${index}">
        <div class="skill-head">
          ${imageWrap(skillImage(item, skill), skill.name, shortFallback(skill.name), "skill-img")}
          <div><strong>${skill.name}</strong><span id="skill_${index}_summary">Lv 0 &rarr; ${skill.max}</span></div>
          <span>${requirement || `${fmt(skill.manuscripts)} ${t("manuscripts")}`}</span>
        </div>
        <div class="plan-row">
          <div class="row-title"><strong>${skill.name}</strong><span>${skill.desc || ""}</span></div>
          ${control(`skill_${index}_current`, t("current"), 0, skill.max, 0)}
          ${control(`skill_${index}_target`, t("target"), 0, skill.max, skill.max)}
        </div>
        <div class="xp-line">
          <label for="skill_${index}_xp">${t("learnedXp")}</label>
          <div class="xp-box"><input id="skill_${index}_xp" inputmode="decimal" value="0"><span>/ ${fmt(skill.xp)} ${t("xp")}</span></div>
          <p class="note">${t("learnedXpHelp")}</p>
        </div>
      </article>`;
    }).join("");
    bindImageFallback($("skills"));
  }
  function bindControls() {
    document.querySelectorAll("input,select").forEach((el) => {
      if (el.dataset.boundCalc) return;
      el.dataset.boundCalc = "1";
      el.addEventListener("input", () => {
        syncPaired(el);
        calculate();
      });
      el.addEventListener("change", () => {
        syncPaired(el);
        calculate();
      });
    });
  }
  function syncPaired(el) {
    const id = el.dataset.pair;
    if (!id) return;
    const range = $(`${id}Range`);
    const input = $(id);
    const min = Number(input.min || range.min || 0);
    const max = Number(input.max || range.max || 100);
    const value = clamp(el.value, min, max);
    range.value = value;
    input.value = value;
    const out = $(`${id}Out`);
    if (out) out.textContent = valueLabel(id, value, max);
  }
  function normalizeTargets() {
    [["currentExpert", "targetExpert"], ["currentClass", "targetClass"], ["currentTalent", "targetTalent"]].forEach(([cur, tar]) => {
      if (Number($(tar).value) < Number($(cur).value)) {
        $(tar).value = $(cur).value;
        $(`${tar}Range`).value = $(cur).value;
      }
    });
    master().skills.forEach((skill, index) => {
      const cur = `skill_${index}_current`;
      const tar = `skill_${index}_target`;
      if (Number($(tar).value) < Number($(cur).value)) {
        $(tar).value = $(cur).value;
        $(`${tar}Range`).value = $(cur).value;
      }
    });
    document.querySelectorAll("input[data-pair]").forEach(syncPaired);
  }
  function calculate() {
    normalizeTargets();
    const item = master();
    const currentExpert = clamp($("currentExpert").value, 1, 100);
    const targetExpert = clamp($("targetExpert").value, 1, 100);
    const currentClass = clamp($("currentClass").value, 1, 11);
    const targetClass = clamp($("targetClass").value, 1, 11);
    const currentTalent = clamp($("currentTalent").value, 0, item.talent.max);
    const targetTalent = clamp($("targetTalent").value, 0, item.talent.max);
    const currentLevelRow = levelAt(item, currentExpert);
    const targetLevelRow = levelAt(item, targetExpert);
    const currentClassRow = classAt(item, currentClass);
    const targetClassRow = classAt(item, targetClass);
    const currentTalentRow = talentAt(item, currentTalent);
    const targetTalentRow = talentAt(item, targetTalent);
    let manuscripts = 0;
    let xp = 0;
    let skillCurrentPower = 0;
    let skillTargetPower = 0;
    const skillRows = item.skills.map((skill, index) => {
      const cur = clamp($(`skill_${index}_current`).value, 0, skill.max);
      const tar = clamp($(`skill_${index}_target`).value, 0, skill.max);
      const curRow = skillAt(skill, cur);
      const tarRow = skillAt(skill, tar);
      const learned = parseAmount($(`skill_${index}_xp`).value);
      const lineManuscripts = Math.max(0, Number(tarRow.cumulativeManuscriptCost || 0) - Number(curRow.cumulativeManuscriptCost || 0));
      const lineXp = Math.max(0, sumSkillXp(skill.levels, cur, tar) - learned);
      const linePower = Math.max(0, Number(tarRow.cumulativePower || 0) - Number(curRow.cumulativePower || 0));
      manuscripts += lineManuscripts;
      xp += lineXp;
      skillCurrentPower += Number(curRow.cumulativePower || 0);
      skillTargetPower += Number(tarRow.cumulativePower || 0);
      const summary = $(`skill_${index}_summary`);
      if (summary) summary.innerHTML = `Lv ${cur} &rarr; ${tar}`;
      return { name: skill.name, skill, cur, tar, manuscripts: lineManuscripts, xp: lineXp, power: linePower };
    });
    const affinity = Math.max(0, Number(targetLevelRow.needAffinity || 0) - Number(currentLevelRow.needAffinity || 0));
    const emblems = Math.max(0, Number(targetClassRow.cumulativeEmblemCost || 0) - Number(currentClassRow.cumulativeEmblemCost || 0));
    const currentPower = Number(currentClassRow.cumulativePower || 0) + Number(currentLevelRow.cumulativePower || 0) + Number(currentTalentRow.cumulativePower || 0) + skillCurrentPower;
    const targetPower = Number(targetClassRow.cumulativePower || 0) + Number(targetLevelRow.cumulativePower || 0) + Number(targetTalentRow.cumulativePower || 0) + skillTargetPower;
    const powerGain = Math.max(0, targetPower - currentPower);
    const currentBuff = (Number(currentClassRow.buffValue || 0) + Number(currentLevelRow.buffValue || 0)) / 100;
    const targetBuff = (Number(targetClassRow.buffValue || 0) + Number(targetLevelRow.buffValue || 0)) / 100;
    const buffGain = Math.max(0, targetBuff - currentBuff);
    const stockAffinity = parseAmount($("stockAffinity").value);
    const stockEmblems = parseAmount($("stockEmblems").value);
    const stockManuscripts = parseAmount($("stockManuscripts").value);
    const gap = (need, stock) => need > stock ? `<span class="need">${t("stillNeed")}: ${fmt(need - stock)}</span>` : `<span class="extra">${t("extra")}: ${fmt(stock - need)}</span>`;
    const rows = skillRows.filter((row) => row.tar > row.cur).map((row) => `<div class="break-row"><strong>${imageWrap(skillImage(item, row.skill), row.name, shortFallback(row.name), "skill-img")}<span>${row.name} Lv ${row.cur} &rarr; ${row.tar}</span></strong><span>${imageWrap(materialImage("manuscripts"), t("manuscripts"), "MS")} ${fmt(row.manuscripts)} · ${fmt(row.xp)} ${t("xp")} · +${fmt(row.power)} ${t("powerGain")}</span></div>`).join("") || `<p class="note">${t("noSkillSelection")}</p>`;
    $("results").innerHTML = `
      <div class="result-card"><span>${t("levelShort")} ${currentExpert} &rarr; ${targetExpert} · ${classNameAt(item, currentClass)} &rarr; ${classNameAt(item, targetClass)} · ${t("talent")} ${currentTalent} &rarr; ${targetTalent}</span></div>
      <div class="result-card"><span class="result-title">${imageWrap(materialImage("affinity"), t("affinity"), "AF")}<span>${t("affinity")}</span></span><strong>${fmt(affinity)}</strong>${gap(affinity, stockAffinity)}</div>
      <div class="result-card"><span class="result-title">${imageWrap(materialImage("emblems"), t("emblems"), "EM")}<span>${t("emblems")}</span></span><strong>${fmt(emblems)}</strong>${gap(emblems, stockEmblems)}</div>
      <div class="result-card"><span class="result-title">${imageWrap(materialImage("manuscripts"), t("manuscripts"), "MS")}<span>${t("manuscripts")}</span></span><strong>${fmt(manuscripts)}</strong>${gap(manuscripts, stockManuscripts)}</div>
      <div class="result-card"><span>${t("time")}</span><strong>${timeText(xp)}</strong><span>${fmt(xp)} ${t("xp")}</span></div>
      <div class="result-card"><span>${t("powerGain")}</span><strong>+${fmt(powerGain)}</strong><span>${fmt(currentPower)} &rarr; ${fmt(targetPower)}</span></div>
      <div class="result-card"><span>${t("buffGain")}</span><strong>+${fmt(buffGain, 2)}%</strong><span>${fmt(currentBuff, 2)}% &rarr; ${fmt(targetBuff, 2)}%</span></div>
      <div class="result-card"><span>${t("skillBreakdown")}</span><div class="breakdown">${rows}</div></div>
    `;
    bindImageFallback($("results"));
  }
  function maxTargets() {
    const item = master();
    [["currentExpert", 1], ["targetExpert", 100], ["currentClass", 1], ["targetClass", 11], ["currentTalent", 0], ["targetTalent", item.talent.max]].forEach(([id, value]) => {
      $(id).value = value;
      $(`${id}Range`).value = value;
    });
    item.skills.forEach((skill, index) => {
      $(`skill_${index}_current`).value = 0;
      $(`skill_${index}_currentRange`).value = 0;
      $(`skill_${index}_target`).value = skill.max;
      $(`skill_${index}_targetRange`).value = skill.max;
      $(`skill_${index}_xp`).value = 0;
    });
    calculate();
  }
  function resetAll() {
    const item = master();
    [["currentExpert", 1], ["targetExpert", 1], ["currentClass", 1], ["targetClass", 1], ["currentTalent", 0], ["targetTalent", 0]].forEach(([id, value]) => {
      $(id).value = value;
      $(`${id}Range`).value = value;
    });
    ["stockAffinity", "stockEmblems", "stockManuscripts"].forEach((id) => { $(id).value = 0; });
    item.skills.forEach((skill, index) => {
      $(`skill_${index}_current`).value = 0;
      $(`skill_${index}_currentRange`).value = 0;
      $(`skill_${index}_target`).value = 0;
      $(`skill_${index}_targetRange`).value = 0;
      $(`skill_${index}_xp`).value = 0;
    });
    calculate();
  }
  function setLang(next) {
    lang = normalizeLang(next);
    localStorage.setItem("siteLang", lang);
    localStorage.setItem("lang", lang);
    const url = new URL(location.href);
    url.searchParams.set("lang", lang);
    history.replaceState(null, "", url);
    renderAll();
  }
  function renderAll() {
    if (!MASTERS.length) {
      document.body.innerHTML = `<main class="wrap"><section class="panel"><div class="panel-body"><h1>Master data could not be loaded.</h1><p>Please upload master_calculator_source_data.js together with this page.</p></div></section></main>`;
      return;
    }
    renderStatic();
    renderMasters();
    renderSelectedMaster();
    renderPlanRows();
    renderSkills();
    renderStockLabels();
    bindControls();
    calculate();
  }
  renderAll();
  $("calculateBtn").addEventListener("click", calculate);
  $("compareBtn").addEventListener("click", calculate);
  $("maxBtn").addEventListener("click", maxTargets);
  $("resetBtn").addEventListener("click", resetAll);
  $("languageSelect").addEventListener("change", (event) => setLang(event.target.value));
})();
