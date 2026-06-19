const assert = require('node:assert/strict');
const { parseScheduleHtml, extractTimesFromSection, timeToMin } = require('../scripts/fetch-eshot.js');

function run() {
  // ── extractTimesFromSection: ID'li (aktif yön) listesi ──
  const htmlWithIds = `
    <ul class="timescape">
      <li><h4>DOĞANBEY Kalkış</h4></li>
      <li class="inBlock" id="time-0550"><span>05:50</span></li>
      <li class="inBlock" id="time-0615"><span>06:15</span></li>
      <li class="inBlock" id="time-1700"><span>17:00</span></li>
      <li class="inBlock" id="time-1730"><span>17:30</span></li>
      <li class="inBlock" id="time-0000"><span>00:00</span></li>
    </ul>`;
  const idResult = extractTimesFromSection(htmlWithIds);
  // 0550->350, 0615->375, 1700->1020, 1730->1050, 0000->0
  assert.deepEqual(idResult, [0, 350, 375, 1020, 1050], 'extractTimesFromSection ID tabanlı parse doğru olmalı');

  // ── extractTimesFromSection: plain text (pasif yön) listesi ──
  const htmlPlainText = `
    <ul class="timescape">
      <li><h4>CUMAOVASI AKT. Kalkış</h4></li>
      <li class="inBlock"><span class="pull-left push-left-5">06:15</span></li>
      <li class="inBlock"><span class="pull-left push-left-5">07:20</span></li>
      <li class="inBlock"><span class="pull-left push-left-5">17:05</span></li>
      <li class="inBlock"><span class="pull-left push-left-5">17:30</span></li>
    </ul>`;
  const textResult = extractTimesFromSection(htmlPlainText);
  assert.deepEqual(textResult, [375, 440, 1025, 1050], 'extractTimesFromSection text tabanlı parse doğru olmalı (CUMAOVASI pasif yön)');

  // ── parseScheduleHtml: iki yönü ayrı listeler olarak çıkar ──
  // ESHOT sitesinin gerçek yapısını taklit eden sabit HTML
  const fullHtml = `
    <div class="schedule-carousel">
      <h3>19.06.2026 Cuma</h3>
      <ul class="timescape">
        <li><h4>DOĞANBEY Kalkış</h4></li>
        <li class="inBlock" id="time-0550"><span>05:50</span></li>
        <li class="inBlock" id="time-0615"><span>06:15</span></li>
        <li class="inBlock" id="time-1700"><span>17:00</span></li>
      </ul>
      <ul class="timescape">
        <li><h4>CUMAOVASI AKT. Kalkış</h4></li>
        <li class="inBlock"><span class="pull-left push-left-5">06:15</span></li>
        <li class="inBlock"><span class="pull-left push-left-5">17:05</span></li>
        <li class="inBlock"><span class="pull-left push-left-5">17:30</span></li>
      </ul>
    </div>`;
  const parsed = parseScheduleHtml(fullHtml);
  assert.equal(parsed.gidisLabel, 'DOĞANBEY Kalkış', 'parseScheduleHtml gidis etiketini çıkarmalı');
  assert.equal(parsed.donusLabel, 'CUMAOVASI AKT. Kalkış', 'parseScheduleHtml donus etiketini çıkarmalı');
  // DOĞANBEY: 0550->350, 0615->375, 1700->1020
  assert.deepEqual(parsed.gidis, [350, 375, 1020], 'parseScheduleHtml GIDIS (DOĞANBEY→CUMAOVASI) doğru listelemeli');
  // CUMAOVASI: 06:15->375, 17:05->1025, 17:30->1050
  assert.deepEqual(parsed.donus, [375, 1025, 1050], 'parseScheduleHtml DONUS (CUMAOVASI→DOĞANBEY) doğru listelemeli');
  assert.notDeepEqual(parsed.gidis, parsed.donus, 'GIDIS ve DONUS farklı olmalı (yön ayrımı çalışıyor)');

  // ── parseScheduleHtml: yön başlığı yoksa hata fırlatmalı ──
  assert.throws(
    () => parseScheduleHtml('<div>başlık yok</div>'),
    /Yön başlıkları/,
    'parseScheduleHtml yön başlığı yoksa hata fırlatmalı'
  );

  // ── timeToMin yardımcı ──
  assert.equal(timeToMin('00:00'), 0);
  assert.equal(timeToMin('05:50'), 350);
  assert.equal(timeToMin('17:30'), 1050);
  assert.equal(timeToMin('23:59'), 1439);

  console.log('fetch-eshot tests passed');
}

run();
