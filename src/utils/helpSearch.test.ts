import test from "node:test";
import assert from "node:assert/strict";
import { searchFaq, stems } from "./helpSearch.ts";

const cats2 = [{ id: "b", label: "B", description: "", items: [
  { q: "Як оплатити програму?", a: "Кнопка «Придбати курс» на сторінці програми." },
  { q: "Що робити, якщо я оплатив(-ла), але контент не відкрився?", a: "Оновіть сторінку та перевірте «Моє навчання»." },
]}];

const cats = [
  { id: "billing", label: "Покупки", description: "", items: [
    { q: "Де знайти придбаний контент?", a: "У розділі «Моє навчання» — усі ваші програми, гайди й медитації." },
    { q: "Чи можу я отримати повернення коштів?", a: "Так, протягом 14 днів з моменту покупки." },
    { q: "Що робити, якщо платіж не пройшов?", a: "Перевірте розділ «Оплати». Якщо списання відбулося, а доступу немає — повідомте." },
  ]},
  { id: "account", label: "Акаунт", description: "", items: [
    { q: "Не можу увійти в акаунт — що робити?", a: "Скористайтеся відновленням пароля." },
  ]},
];

test("empty query returns everything", () => {
  const r = searchFaq(cats, "  ");
  assert.equal(r.total, 4);
});

test("a natural sentence finds the right answer first", () => {
  const r = searchFaq(cats, "я оплатив курс, але не бачу придбаний контент");
  assert.ok(r.total >= 1);
  assert.equal(r.categories[0].items[0].q, "Де знайти придбаний контент?");
});

test("inflected words still match (повернути → повернення)", () => {
  const r = searchFaq(cats, "хочу повернути кошти");
  assert.equal(r.categories[0].items[0].q, "Чи можу я отримати повернення коштів?");
});

test("nonsense matches nothing", () => {
  assert.equal(searchFaq(cats, "ґвинтокрил").total, 0);
});

test("stems drop stop words and duplicates", () => {
  assert.ok(!stems("не але що").length);
  assert.equal(stems("курс курс").length, 1);
});

test("the exact word typed ranks higher than a stem-only match", () => {
  const r = searchFaq(cats2, "я оплатив курс, але не бачу його");
  assert.equal(r.categories[0].items[0].q.startsWith("Що робити, якщо я оплатив"), true);
});
