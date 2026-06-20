const assert = require('node:assert/strict');
const {
  parseScheduleHtml, extractTimesFromSection, timeToMin,
  parsePanel, dayNameToTariff, decodeEntities
} = require('../scripts/fetch-eshot.js');

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
assert.deepEqual(idResult, [0, 350, 375, 1020, 1050], 'extractTimesFromSection ID tabanlı parse doğru olmalı');

// ── extractTimesFromSection: plain text (pasif yön) listesi ──
const htmlPlainText = `
  <ul class="timescape">
    <li><h4>CUMAOVASI AKT. Kalkış</h4></li>
    <li class="inBlock"><span class="pull-left push-left-5">06:15</span></li>
    <li class="inBlock"><span class="pull-left push-left-5">17:05</span></li>
    <li class="inBlock"><span class="pull-left push-left-5">17:30</span></li>
  </ul>`;
const textResult = extractTimesFromSection(htmlPlainText);
assert.deepEqual(textResult, [375, 1025, 1050], 'extractTimesFromSection text tabanlı parse doğru olmalı');

// ── parsePanel: tek gün panelinden iki yön ──
const panelHtml = `
  <div class="panel-heading"><h4><strong>20.06.2026</strong></h4><h4>Cumartesi</h4></div>
  <div class="panel-body">
    <div class="col-md-6">
      <h4>DOĞANBEY Kalkış</h4>
      <li class="inBlock" id="time-0600"><span>06:00</span></li>
      <li class="inBlock" id="time-1710"><span>17:10</span></li>
    </div>
    <div class="col-md-6">
      <h4>CUMAOVASI AKT. Kalkış</h4>
      <li class="inBlock"><span class="pull-left push-left-5">06:35</span></li>
      <li class="inBlock"><span class="pull-left push-left-5">17:40</span></li>
    </div>
  </div>`;
const panel = parsePanel(panelHtml, 'DOĞANBEY Kalkış', 'CUMAOVASI AKT. Kalkış');
assert.deepEqual(panel.gidis, [360, 1030], 'parsePanel gidis (DOĞANBEY) doğru');
assert.deepEqual(panel.donus, [395, 1060], 'parsePanel donus (CUMAOVASI) doğru');

// ── dayNameToTariff: gün adı → 3 tarife ──
assert.equal(dayNameToTariff('Pazartesi'), 'weekday');
assert.equal(dayNameToTariff('Salı'), 'weekday');
assert.equal(dayNameToTariff('Çarşamba'), 'weekday');
assert.equal(dayNameToTariff('Perşembe'), 'weekday');
assert.equal(dayNameToTariff('Cuma'), 'weekday');
assert.equal(dayNameToTariff('Cumartesi'), 'saturday');
assert.equal(dayNameToTariff('Pazar'), 'sunday');
assert.equal(dayNameToTariff('Bilinmeyen'), null);

// ── decodeEntities: HTML entity çözümü ──
assert.equal(decodeEntities('&#199;arşamba'), 'Çarşamba');
assert.equal(decodeEntities('Pazartesi'), 'Pazartesi');
assert.equal(decodeEntities('A&amp;B'), 'A&B');

// ── parseScheduleHtml: 3-günlük fixture (Cuma/Cumartesi/Pazar) ──
// ESHOT sitesinin gerçek yapısını taklit eder: her gün panel, içinde 2 yön
const multiDayHtml = `
  <div class="schedule-carousel">
    <div class="panel panel-default">
      <div class="panel-heading">
        <h4 class="col-md-12"><strong>19.06.2026</strong></h4>
        <h4 class="col-md-12">Cuma</h4>
      </div>
      <div class="panel-body">
        <div class="col-md-6">
          <h4>DOĞANBEY Kalkış</h4>
          <li class="inBlock" id="time-0550"><span>05:50</span></li>
          <li class="inBlock" id="time-1700"><span>17:00</span></li>
          <li class="inBlock" id="time-1730"><span>17:30</span></li>
        </div>
        <div class="col-md-6">
          <h4>CUMAOVASI AKT. Kalkış</h4>
          <li class="inBlock"><span class="pull-left push-left-5">06:15</span></li>
          <li class="inBlock"><span class="pull-left push-left-5">17:05</span></li>
          <li class="inBlock"><span class="pull-left push-left-5">17:30</span></li>
        </div>
      </div>
    </div>
    <div class="panel panel-default">
      <div class="panel-heading">
        <h4 class="col-md-12"><strong>20.06.2026</strong></h4>
        <h4 class="col-md-12">Cumartesi</h4>
      </div>
      <div class="panel-body">
        <div class="col-md-6">
          <h4>DOĞANBEY Kalkış</h4>
          <li class="inBlock" id="time-0600"><span>06:00</span></li>
          <li class="inBlock" id="time-1710"><span>17:10</span></li>
        </div>
        <div class="col-md-6">
          <h4>CUMAOVASI AKT. Kalkış</h4>
          <li class="inBlock"><span class="pull-left push-left-5">06:35</span></li>
          <li class="inBlock"><span class="pull-left push-left-5">17:40</span></li>
        </div>
      </div>
    </div>
    <div class="panel panel-default">
      <div class="panel-heading">
        <h4 class="col-md-12"><strong>21.06.2026</strong></h4>
        <h4 class="col-md-12">Pazar</h4>
      </div>
      <div class="panel-body">
        <div class="col-md-6">
          <h4>DOĞANBEY Kalkış</h4>
          <li class="inBlock" id="time-0600"><span>06:00</span></li>
          <li class="inBlock" id="time-1710"><span>17:10</span></li>
        </div>
        <div class="col-md-6">
          <h4>CUMAOVASI AKT. Kalkış</h4>
          <li class="inBlock"><span class="pull-left push-left-5">06:35</span></li>
          <li class="inBlock"><span class="pull-left push-left-5">17:40</span></li>
        </div>
      </div>
    </div>
  </div>`;

const parsed = parseScheduleHtml(multiDayHtml);

// 3 tarife de gelmiş olmalı
assert.ok(parsed.weekday, 'parseScheduleHtml weekday çıkarmalı');
assert.ok(parsed.saturday, 'parseScheduleHtml saturday çıkarmalı');
assert.ok(parsed.sunday, 'parseScheduleHtml sunday çıkarmalı');

// Hafta içi (Cuma): DOĞANBEY 05:50,17:00,17:30; CUMAOVASI 06:15,17:05,17:30
assert.deepEqual(parsed.weekday.gidis, [350, 1020, 1050], 'weekday gidis (DOĞANBEY) doğru');
assert.deepEqual(parsed.weekday.donus, [375, 1025, 1050], 'weekday donus (CUMAOVASI) doğru');
// Cumartesi: DOĞANBEY 06:00,17:10; CUMAOVASI 06:35,17:40
assert.deepEqual(parsed.saturday.gidis, [360, 1030], 'saturday gidis (DOĞANBEY) doğru');
assert.deepEqual(parsed.saturday.donus, [395, 1060], 'saturday donus (CUMAOVASI) doğru');
// Pazar: cumartesi ile aynı
assert.deepEqual(parsed.sunday.gidis, [360, 1030], 'sunday gidis doğru');
assert.deepEqual(parsed.sunday.donus, [395, 1060], 'sunday donus doğru');

// Hafta içi ve cumartesi FARKLI olmalı (gün ayrımı çalışıyor)
assert.notDeepEqual(parsed.weekday.gidis, parsed.saturday.gidis, 'weekday ve saturday gidis farklı olmalı');
assert.notDeepEqual(parsed.weekday.donus, parsed.saturday.donus, 'weekday ve saturday donus farklı olmalı');

// Etiketler
assert.ok(parsed.weekdayLabel.includes('Cuma'), 'weekdayLabel Cuma içermeli');
assert.ok(parsed.saturdayLabel.includes('Cumartesi'), 'saturdayLabel Cumartesi içermeli');
assert.ok(parsed.sundayLabel.includes('Pazar'), 'sundayLabel Pazar içermeli');

// ── parseScheduleHtml: eksik gün fallback (sadece Cuma varsa) ──
const weekdayOnlyHtml = `
  <div class="panel panel-default">
    <div class="panel-heading">
      <h4 class="col-md-12"><strong>19.06.2026</strong></h4>
      <h4 class="col-md-12">Cuma</h4>
    </div>
    <div class="panel-body">
      <h4>DOĞANBEY Kalkış</h4>
      <li class="inBlock" id="time-0550"><span>05:50</span></li>
      <h4>CUMAOVASI AKT. Kalkış</h4>
      <li class="inBlock"><span class="pull-left push-left-5">06:15</span></li>
    </div>
  </div>`;
const onlyWeekday = parseScheduleHtml(weekdayOnlyHtml);
assert.deepEqual(onlyWeekday.saturday.gidis, onlyWeekday.weekday.gidis, 'Cumartesi eksikse hafta içine düşmeli');
assert.deepEqual(onlyWeekday.sunday.donus, onlyWeekday.weekday.donus, 'Pazar eksikse hafta içine düşmeli');

// ── parseScheduleHtml: yön başlığı yoksa hata ──
assert.throws(() => parseScheduleHtml('<div>başlık yok</div>'), /Yön başlıkları/, 'yön başlığı yoksa hata');

// ── timeToMin yardımcı ──
assert.equal(timeToMin('00:00'), 0);
assert.equal(timeToMin('05:50'), 350);
assert.equal(timeToMin('17:30'), 1050);
assert.equal(timeToMin('23:59'), 1439);

console.log('fetch-eshot tests passed');
