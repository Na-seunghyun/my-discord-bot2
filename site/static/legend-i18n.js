(function () {
  const labels = {
    ko: '한국어',
    en: 'English',
    'zh-CN': '简体中文',
    'zh-TW': '繁體中文',
    fr: 'Francais',
    de: 'Deutsch',
    th: 'ไทย',
    id: 'Indonesia',
  };

  const en = {
    brandSub: 'Kingshot command tools',
    support: 'Support page',
    footerCredit: 'Created by #885 Legend nashsh',
    heroBadge: 'Live command deck',
    tagAlliance: 'Alliance Operations',
    tagIntel: 'Player Intel',
    tagMap: 'War Map',
    tagCalc: 'Calculator Vault',
    tagFeedback: 'Feedback',
    heroA: 'Kingshot tools',
    subtitle: 'A premium command hub for map planning, player intel, calculators, and alliance coordination. Built for quick use on desktop and mobile.',
    primary: 'Open Intel Lookup',
    secondary: 'Open War Map Planner',
    visitsTotal: 'Total visits',
    visitsToday: 'Today',
    visitHint: 'Protected by a daily KV safety cap.',
    todayHint: 'Counts once per browser each day.',
    toolCount: 'Tools',
    toolHint: 'Planner, intel, calculators, feedback.',
    fortTitle: 'Fort / Sanc Distributor',
    fortBody: 'Alliance rotation planning moved to the front. Build fair Fort and Sanctuary assignments quickly.',
    fortButton: 'Open distributor',
    intelTitle: 'Kingshot Intel Lookup',
    intelBody: 'Search players, kingdoms, hero gear, and saved local intel when the upstream service is unstable.',
    intelButton: 'Open intel',
    mapTitle: 'War Map Planner',
    mapBody: 'Plan cities, traps, castles, turrets, distance lines, and march timing.',
    mapButton: 'Open planner',
    calcTitle: 'Kingshot Calculators',
    calcBody: 'Training, gear, VIP, pack value, and other resource planning calculators.',
    calcButton: 'Open calculators',
    feedbackTitle: 'Updates / Bug Reports',
    feedbackBody: 'Send suggestions, calculation issues, translation fixes, or mobile feedback.',
    feedbackButton: 'Open feedback',
    back: 'Back to hub',
    title: 'Updates / Bug Reports',
    formTitle: 'Send feedback',
    typeLabel: 'Type',
    typeBug: 'Bug report',
    typeUpdate: 'Feature request',
    typeTranslation: 'Translation issue',
    typeOther: 'Other',
    pageLabel: 'Related page',
    pageHub: 'Hub',
    pageCalculator: 'Calculator',
    pageMap: 'Map planner',
    pageLookup: 'Intel lookup',
    pageFort: 'Fort / Sanc',
    pageOther: 'Other',
    messageLabel: 'Message',
    messagePlaceholder: 'Describe the problem or feature you need.',
    contactLabel: 'Contact or nickname',
    contactPlaceholder: 'Optional',
    submit: 'Submit',
    ready: 'Submit the form to save it.',
    adminTitle: 'Admin review',
    adminHelp: 'Set ADMIN_TOKEN in Cloudflare, then use the same token to read recent feedback.',
    tokenLabel: 'Admin token',
    tokenPlaceholder: 'ADMIN_TOKEN',
    load: 'Load',
    setup: 'Setup',
    setupHint: 'Enter alliances and target counts, then generate a fair rotation.',
    alliances: 'Alliances',
    rounds: 'Rounds',
    seed: 'Shuffle seed',
    fortCount: 'Forts per round',
    sancCount: 'Sanc per round',
    fortPoints: 'Fort points',
    sancPoints: 'Sanc points',
    generate: 'Generate',
    copy: 'Copy result',
    resultTitle: 'Distribution Plan',
    resultHint: 'Lowest total score receives priority in the next slot.',
    empty: 'Generate a plan to see the rotation here.',
    slots: 'slots',
    items: 'items',
    storedPlayers: 'Stored players',
    cachedData: 'Cached responses',
    storageState: 'Storage state',
    quickSearch: 'Quick search',
    playerPlaceholder: 'Player name or ID',
    search: 'Search',
    idDetail: 'ID detail',
    kingdomPlaceholder: 'Kingdom number, e.g. 885',
    open: 'Open',
    scoutBoard: 'Scout board',
    shuffle: 'Shuffle',
    loadingTiles: 'Loading profile blocks.',
    resultsTitle: 'Search results',
    emptyResults: 'No information to show yet.',
    kingdomInfo: 'Kingdom info',
    emptyKingdom: 'Enter a kingdom number to load the summary.',
    refresh: 'Refresh',
    close: 'Close',
  };

  const ko = {
    brandSub: 'Kingshot 지휘 도구',
    support: '후원 페이지',
    footerCredit: 'Created by #885 Legend nashsh',
    heroBadge: '실시간 지휘 허브',
    tagAlliance: '연맹 운영',
    tagIntel: '플레이어 인텔',
    tagMap: '전쟁 지도',
    tagCalc: '계산기 보관함',
    tagFeedback: '건의함',
    heroA: 'Kingshot 도구',
    subtitle: '지도 계획, 플레이어 정보, 계산기, 연맹 운영 도구를 빠르고 고급스럽게 사용할 수 있도록 정리한 허브입니다. PC와 모바일 모두 편하게 사용할 수 있습니다.',
    primary: '인텔 검색 열기',
    secondary: '전쟁 지도 열기',
    visitsTotal: '전체 방문',
    visitsToday: '오늘',
    visitHint: 'KV 일일 안전 한도로 보호됩니다.',
    todayHint: '브라우저당 하루 1회 기록됩니다.',
    toolCount: '도구',
    toolHint: '지도, 인텔, 계산기, 건의함.',
    fortTitle: 'Fort / Sanc 분배기',
    fortBody: '연맹 로테이션 도구를 앞단으로 분리했습니다. Fort와 Sanctuary 배정을 빠르고 공정하게 만들 수 있습니다.',
    fortButton: '분배기 열기',
    intelTitle: 'Kingshot 인텔 검색',
    intelBody: '플레이어, 왕국, 영웅 장비, 저장된 로컬 정보를 확인합니다. 원본 서버가 불안정해도 저장 데이터로 보완됩니다.',
    intelButton: '인텔 열기',
    mapTitle: '전쟁 지도 플래너',
    mapBody: '도시, 함정, 캐슬, 포탑, 거리선, 행군 시간을 계획합니다.',
    mapButton: '지도 열기',
    calcTitle: 'Kingshot 계산기',
    calcBody: '훈련, 장비, VIP, 패키지 가치 등 기존 계산기들을 모았습니다.',
    calcButton: '계산기 열기',
    feedbackTitle: '업데이트 / 오류 건의',
    feedbackBody: '기능 제안, 계산 오류, 번역 문제, 모바일 불편사항을 남길 수 있습니다.',
    feedbackButton: '건의함 열기',
    back: '허브로 돌아가기',
    title: '업데이트 / 오류 건의',
    formTitle: '건의 남기기',
    typeLabel: '유형',
    typeBug: '오류 제보',
    typeUpdate: '업데이트 건의',
    typeTranslation: '번역 문제',
    typeOther: '기타',
    pageLabel: '관련 페이지',
    pageHub: '허브',
    pageCalculator: '계산기',
    pageMap: '맵 플래너',
    pageLookup: '플레이어 정보 검색',
    pageFort: 'Fort / Sanc',
    pageOther: '기타',
    messageLabel: '내용',
    messagePlaceholder: '어떤 문제가 있었는지, 어떤 기능이 필요한지 적어주세요.',
    contactLabel: '연락처 또는 닉네임',
    contactPlaceholder: '선택 사항',
    submit: '제출하기',
    ready: '작성 후 제출하면 저장됩니다.',
    adminTitle: '운영자 확인',
    adminHelp: 'Cloudflare 환경 변수 ADMIN_TOKEN을 설정한 뒤, 같은 토큰으로 최근 건의를 확인할 수 있습니다.',
    tokenLabel: '관리자 토큰',
    tokenPlaceholder: 'ADMIN_TOKEN',
    load: '불러오기',
    setup: '설정',
    setupHint: '연맹과 목표 수를 입력한 뒤 공정한 로테이션을 생성하세요.',
    alliances: '연맹 목록',
    rounds: '라운드',
    seed: '섞기 기준',
    fortCount: '라운드당 Fort',
    sancCount: '라운드당 Sanc',
    fortPoints: 'Fort 점수',
    sancPoints: 'Sanc 점수',
    generate: '생성',
    copy: '결과 복사',
    resultTitle: '분배 계획',
    resultHint: '누적 점수가 낮은 연맹부터 다음 슬롯에 우선 배정합니다.',
    empty: '생성 버튼을 누르면 이곳에 로테이션이 표시됩니다.',
    slots: '슬롯',
    items: '개 항목',
    storedPlayers: '저장된 플레이어',
    cachedData: '캐시 응답',
    storageState: '저장소 상태',
    quickSearch: '빠른 검색',
    playerPlaceholder: '플레이어 이름 또는 ID',
    search: '검색',
    idDetail: 'ID 상세',
    kingdomPlaceholder: '왕국 번호 예: 885',
    open: '열기',
    scoutBoard: '스카우트 보드',
    shuffle: '새로 보기',
    loadingTiles: '프로필 블록을 불러오는 중입니다.',
    resultsTitle: '검색 결과',
    emptyResults: '아직 표시할 정보가 없습니다.',
    kingdomInfo: '왕국 정보',
    emptyKingdom: '왕국 번호를 조회하면 요약이 표시됩니다.',
    refresh: '갱신',
    close: '닫기',
  };

  const fr = Object.assign({}, en, {
    support: 'Page de soutien',
    primary: 'Ouvrir Intel',
    secondary: 'Ouvrir la carte',
    back: 'Retour au hub',
    search: 'Rechercher',
    open: 'Ouvrir',
    close: 'Fermer',
    refresh: 'Actualiser',
    submit: 'Envoyer',
    load: 'Charger',
  });
  const de = Object.assign({}, en, {
    support: 'Support-Seite',
    primary: 'Intel offnen',
    secondary: 'Karte offnen',
    back: 'Zuruck zum Hub',
    search: 'Suchen',
    open: 'Offnen',
    close: 'Schliessen',
    refresh: 'Aktualisieren',
    submit: 'Senden',
    load: 'Laden',
  });
  const id = Object.assign({}, en, {
    support: 'Halaman dukungan',
    primary: 'Buka Intel',
    secondary: 'Buka peta perang',
    back: 'Kembali ke hub',
    search: 'Cari',
    open: 'Buka',
    close: 'Tutup',
    refresh: 'Muat ulang',
    submit: 'Kirim',
    load: 'Muat',
  });

  const dicts = {
    ko,
    en,
    'zh-CN': Object.assign({}, en, { support: '支持页面', back: '返回中心', search: '搜索', open: '打开', close: '关闭', refresh: '刷新', submit: '提交', load: '加载' }),
    'zh-TW': Object.assign({}, en, { support: '支援頁面', back: '返回中心', search: '搜尋', open: '開啟', close: '關閉', refresh: '重新整理', submit: '提交', load: '載入' }),
    fr,
    de,
    th: Object.assign({}, en, { support: 'หน้าสนับสนุน', back: 'กลับไปหน้าหลัก', search: 'ค้นหา', open: 'เปิด', close: 'ปิด', refresh: 'รีเฟรช', submit: 'ส่ง', load: 'โหลด' }),
    id,
  };

  window.LEGEND_I18N = { labels, dicts };

  function currentLang() {
    const q = new URL(location.href).searchParams.get('lang');
    const saved = localStorage.getItem('siteLang') || localStorage.getItem('lang');
    return dicts[q] ? q : dicts[saved] ? saved : 'ko';
  }

  function tr(lang, key) {
    return (dicts[lang] && dicts[lang][key]) || en[key] || key;
  }

  function apply(lang) {
    const next = dicts[lang] ? lang : 'ko';
    document.documentElement.lang = next;
    document.querySelectorAll('#langSelect option').forEach((option) => {
      option.textContent = labels[option.value] || option.textContent;
    });
    document.querySelectorAll('[data-i18n]').forEach((node) => {
      node.textContent = tr(next, node.dataset.i18n);
    });
    document.querySelectorAll('[data-placeholder]').forEach((node) => {
      node.setAttribute('placeholder', tr(next, node.dataset.placeholder));
    });
    document.querySelectorAll('[data-i18n-title]').forEach((node) => {
      node.setAttribute('title', tr(next, node.dataset.i18nTitle));
    });
    document.querySelectorAll('[data-i18n-aria]').forEach((node) => {
      const pairs = (node.dataset.i18nAria || '').split(',');
      pairs.forEach((pair) => {
        const [attr, key] = pair.split(':').map((value) => value && value.trim());
        if (attr && key) node.setAttribute(attr, tr(next, key));
      });
    });
    document.querySelectorAll('[data-link-base]').forEach((link) => {
      link.href = `${link.dataset.linkBase}?lang=${encodeURIComponent(next)}`;
    });
    const select = document.getElementById('langSelect');
    if (select) select.value = next;
    localStorage.setItem('lang', next);
    localStorage.setItem('siteLang', next);
    const url = new URL(location.href);
    url.searchParams.set('lang', next);
    history.replaceState(null, '', url.toString());
  }

  document.addEventListener('DOMContentLoaded', () => {
    const lang = currentLang();
    apply(lang);
    const select = document.getElementById('langSelect');
    if (select && !select.dataset.legendBound) {
      select.dataset.legendBound = '1';
      select.addEventListener('change', (event) => apply(event.target.value));
    }
  });
})();
