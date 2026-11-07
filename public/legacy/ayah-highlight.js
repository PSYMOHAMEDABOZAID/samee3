/* SAMEE3 legacy highlighting: ES5, no framework, no fetch, no Promise, no build step.
 * This is an enhancement only. The Quran HTML and native audio remain usable without JS.
 * Time units: SAMEE3 /api/alafasy-timings/{surah} returns start_time/end_time in MILLISECONDS.
 */
(function () {
  'use strict';
  var page = document.getElementById('legacy-quran-page');
  if (!page) { return; }
  var audio = document.getElementById('legacy-quran-audio');
  var status = document.getElementById('legacy-highlight-status');
  var follow = document.getElementById('legacy-follow-ayah');
  var verses = page.getElementsByClassName ? page.getElementsByClassName('ayah') : page.getElementsByTagName('span');
  var timings = [];
  var timingByAyah = {};
  var selected = null;
  var current = null;
  var lastScrolledAt = 0;
  var startApplied = false;
  var lastStatusText = '';
  var sourceSurah = audio ? Number(audio.getAttribute('data-surah')) : 0;
  var timingUrl = audio ? audio.getAttribute('data-timings-url') : '';

  function on(element, eventName, handler) {
    if (!element) { return; }
    if (element.addEventListener) { element.addEventListener(eventName, handler, false); }
    else if (element.attachEvent) { element.attachEvent('on' + eventName, handler); }
  }
  function number(value) { return Number(value); }
  function isFiniteNumber(n) { return typeof n === 'number' && isFinite(n); }
  function addClass(element, name) {
    if (element && (' ' + element.className + ' ').indexOf(' ' + name + ' ') < 0) {
      element.className += ' ' + name;
    }
  }
  function removeClass(element, name) {
    if (element) { element.className = (' ' + element.className + ' ').replace(' ' + name + ' ', ' ').replace(/^\s+|\s+$/g, ''); }
  }
  function show(message) {
    if (status && message !== lastStatusText) { status.textContent = message; lastStatusText = message; }
  }
  function findElement(surah, ayah) { return document.getElementById('verse-' + surah + '-' + ayah); }

  function scrollIntoViewIfNeeded(element) {
    if (!element || !follow || !follow.checked || !element.getBoundingClientRect) { return; }
    var now = new Date().getTime();
    if (now - lastScrolledAt < 800) { return; }
    var rect = element.getBoundingClientRect();
    var h = window.innerHeight || document.documentElement.clientHeight || 600;
    if (rect.top >= h * 0.22 && rect.bottom <= h * 0.8) { return; }
    lastScrolledAt = now;
    // The old one-argument scrollIntoView works on browsers without smooth-scrolling support.
    if (element.scrollIntoView) { element.scrollIntoView(false); }
  }

  function activate(element, timed) {
    if (current !== element) {
      removeClass(current, 'is-current');
      current = element;
      addClass(current, 'is-current');
      if (timed) { scrollIntoViewIfNeeded(current); }
    }
  }

  function findAtTime(timeMilliseconds) {
    // Binary search over non-overlapping, validated timing intervals.
    var lo = 0, hi = timings.length - 1, mid, row;
    while (lo <= hi) {
      mid = (lo + hi) >> 1;
      row = timings[mid];
      if (timeMilliseconds < row.start_time) { hi = mid - 1; }
      else if (timeMilliseconds >= row.end_time) { lo = mid + 1; }
      else { return row; }
    }
    return null;
  }

  function update() {
    if (!audio || !timings.length) { return; }
    var t = number(audio.currentTime);
    if (!isFiniteNumber(t) || t < 0) { return; }
    var row = findAtTime(t * 1000);
    var target = row ? findElement(sourceSurah, row.ayah) : null;
    activate(target, true);
    if (row && target) {
      show('يُتلى الآن: الآية ' + row.ayah + ' — التظليل مرتبط بتسجيل العفاسي المجمّع');
    } else if (row) {
      show('يُتلى الآن: الآية ' + row.ayah + ' (خارج الصفحة الحالية). انتقل للصفحة المناسبة لمتابعتها.');
    } else {
      show('موضع الصوت الحالي خارج نطاق توقيت الآيات المتاح؛ لن نُظهر تظليلًا غير دقيق.');
    }
  }

  function seekToStart() {
    if (!audio || startApplied || !timings.length) { return; }
    // Native media on old Safari may reject seeks until metadata is ready.
    if (typeof audio.readyState === 'number' && audio.readyState < 1) { return; }
    var target = Number(audio.getAttribute('data-start-ayah'));
    if (target <= 1) { startApplied = true; return; }
    if (!timingByAyah[target]) {
      show('تعذر إيجاد توقيت بداية هذه الصفحة. يمكنك تشغيل السورة من البداية.');
      startApplied = true; return;
    }
    try {
      audio.currentTime = timingByAyah[target].start_time / 1000;
      startApplied = true;
      update();
    } catch (error) {
      // Browsers may reject seek before data is available: retry on canplay.
    }
  }

  function validateTimings(rows) {
    if (!rows || Object.prototype.toString.call(rows) !== '[object Array]' || !rows.length) { return false; }
    var prevAyah = 0, prevStart = -1, i, r, ayah, start, end, expected = {};
    for (i = 0; i < rows.length; i++) {
      r = rows[i];
      if (!r || typeof r !== 'object') { return false; }
      ayah = number(r.ayah); start = number(r.start_time); end = number(r.end_time);
      if (!isFiniteNumber(ayah) || ayah !== Math.floor(ayah) || ayah !== prevAyah + 1 ||
          !isFiniteNumber(start) || !isFiniteNumber(end) || start < 0 || end <= start ||
          (prevStart >= 0 && start < prevStart)) { return false; }
      // Some recordings have slight adjacent-ayah overlaps. Assign overlap to the
      // next ayah rather than rejecting real timings or painting two at once.
      if (prevAyah && expected[prevAyah].end_time > start) {
        expected[prevAyah].end_time = start;
      }
      expected[ayah] = { ayah: ayah, start_time: start, end_time: end };
      prevAyah = ayah; prevStart = start;
    }
    timings = [];
    for (i = 1; i <= prevAyah; i++) { timings.push(expected[i]); }
    timingByAyah = expected;
    return true;
  }

  function timingsAvailable() {
    // Do not use a different recording's timing data if the media duration disagrees.
    if (audio && timings.length && isFiniteNumber(audio.duration) && audio.duration > 0) {
      var finalSeconds = timings[timings.length - 1].end_time / 1000;
      if (finalSeconds > audio.duration + Math.max(12, audio.duration * .08)) {
        timings = [];
        timingByAyah = {};
        show('مدة توقيت الآيات لا تطابق التسجيل الحالي؛ تم إيقاف التظليل حفاظًا على الدقة.');
        activate(null, false);
        return;
      }
    }
    show('التظليل المتزامن جاهز. اضغط تشغيل، أو اضغط أي آية للانتقال لموضعها.');
    seekToStart();
    update();
  }

  function loadTimings() {
    if (!audio || !timingUrl || !window.XMLHttpRequest || !window.JSON) { return; }
    var request;
    try {
      request = new XMLHttpRequest();
      request.open('GET', timingUrl, true);
      request.onreadystatechange = function () {
        if (request.readyState !== 4) { return; }
        if (request.status !== 200) {
          show('ملف توقيتات هذا التسجيل غير متاح حاليًا. الصوت والقراءة يعملان؛ التظليل التلقائي متوقف.');
          return;
        }
        try {
          if (!validateTimings(JSON.parse(request.responseText))) {
            show('بيانات التوقيت غير صحيحة. تم تعطيل التظليل التلقائي لتجنب عرض آية خاطئة.');
            return;
          }
          timingsAvailable();
        } catch (error) {
          show('تعذر قراءة ملف التوقيت. التظليل اليدوي متاح.');
        }
      };
      request.send(null);
    } catch (error) {
      show('المتصفح لا يستطيع قراءة توقيتات التلاوة؛ التظليل اليدوي متاح.');
    }
  }

  function chooseVerse(element) {
    if (!element || !element.getAttribute) { return; }
    var surah = number(element.getAttribute('data-surah'));
    var ayah = number(element.getAttribute('data-ayah'));
    removeClass(selected, 'is-selected');
    selected = element;
    addClass(element, 'is-selected');
    if (audio && surah === sourceSurah && timingByAyah[ayah]) {
      startApplied = true; // Manual seek supersedes initial page position.
      try {
        audio.currentTime = timingByAyah[ayah].start_time / 1000;
        update();
        show('تم الانتقال إلى الآية ' + ayah + '. اضغط تشغيل أو استئناف للاستماع.');
      } catch (error) { show('تعذر الانتقال لهذا الموضع في المتصفح الحالي.'); }
    } else if (audio && surah !== sourceSurah) {
      show('تم تحديد الآية ' + ayah + '. اختر سورتها من قائمة السورة المسموعة لتشغيلها.');
    } else {
      show('تم تحديد الآية ' + ayah + '. التظليل الصوتي التلقائي يحتاج توقيتات التسجيل نفسه.');
    }
  }

  // Setting `tabindex` in HTML allows keyboard navigation even on older browsers.
  var i, element;
  for (i = 0; i < verses.length; i++) {
    element = verses[i];
    if (!element || !element.getAttribute || element.getAttribute('data-ayah') === null) { continue; }
    addClass(element, 'verse-clickable');
    (function (verse) {
      on(verse, 'click', function () { chooseVerse(verse); });
      on(verse, 'keydown', function (event) {
        event = event || window.event;
        if (event.keyCode === 13 || event.keyCode === 32) {
          if (event.preventDefault) { event.preventDefault(); }
          chooseVerse(verse);
        }
      });
    }(element));
  }

  if (audio) {
    on(audio, 'loadedmetadata', function () { if (timings.length) { timingsAvailable(); } });
    on(audio, 'canplay', seekToStart);
    on(audio, 'seeked', update);
    on(audio, 'timeupdate', update);
    on(audio, 'play', function () { seekToStart(); update(); });
    on(audio, 'ended', function () { activate(null, false); show('انتهى تشغيل السورة.'); });
    on(audio, 'error', function () { activate(null, false); show('تعذر تشغيل ملف الصوت؛ يمكنك فتح رابط MP3 مباشرة أو اختيار قارئ آخر.'); });
    loadTimings();
  }
}());
