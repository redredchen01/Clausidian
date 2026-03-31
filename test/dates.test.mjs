import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  todayStr, weekdayShort, prevDate, nextDate,
  getWeekDates, getWeekLabel, getMonthRange,
} from '../src/dates.mjs';

describe('dates', () => {
  it('todayStr returns YYYY-MM-DD format', () => {
    assert.match(todayStr(), /^\d{4}-\d{2}-\d{2}$/);
  });

  it('weekdayShort returns 3-char day', () => {
    assert.equal(weekdayShort('2026-03-27'), 'Fri');
    assert.equal(weekdayShort('2026-03-23'), 'Mon');
  });

  it('prevDate/nextDate', () => {
    assert.equal(prevDate('2026-03-27'), '2026-03-26');
    assert.equal(nextDate('2026-03-27'), '2026-03-28');
    assert.equal(prevDate('2026-03-01'), '2026-02-28');
    assert.equal(nextDate('2026-02-28'), '2026-03-01');
  });

  it('getWeekDates returns 7 dates starting Monday', () => {
    const dates = getWeekDates('2026-03-27');
    assert.equal(dates.length, 7);
    assert.equal(dates[0], '2026-03-23'); // Monday
    assert.equal(dates[6], '2026-03-29'); // Sunday
  });

  it('getWeekLabel returns week info', () => {
    const { week, weekNum, year } = getWeekLabel('2026-03-23');
    assert.equal(year, 2026);
    assert.ok(weekNum > 0 && weekNum <= 53);
    assert.match(week, /^2026-W\d{2}$/);
  });

  it('getMonthRange', () => {
    const { start, end } = getMonthRange(2026, 3);
    assert.equal(start, '2026-03-01');
    assert.equal(end, '2026-03-31');

    const feb = getMonthRange(2026, 2);
    assert.equal(feb.end, '2026-02-28');
  });
});
