// Real, program-specific module/item breakdowns for the demo catalog
// (src/data/programs.ts) — used by ProgramExperience.tsx (the actual
// prohождення player) and programDetail/ProgramDetailPage.tsx's "Ваш шлях" preview.
// Real, authored programs (program.authorId set) don't have this yet —
// AuthorCourseEditor only collects a bare lessons COUNT per module, no
// individual items — so real content simply has no item-level
// experience until a content_items table + editor UI exist. Nothing
// here assumes a fixed module or item count: stress-course has 6
// modules of uneven size (2–5 items), the others have 4–5 modules of 2
// items each — the engine (lib/contentProgress.ts) doesn't care either
// way.

import type { ContentModule, ItemProgressMap } from "./contentTypes.ts";

function m(id: string, title: string, description: string, items: ContentModule["items"]): ContentModule {
  return { id, title, description, items };
}

export const programModules: Record<string, ContentModule[]> = {
  "stress-course": [
    m(
      "stress-course__m1",
      "Як працює стрес",
      "Що таке стрес з точки зору тіла та мозку, і чому реакція на нього не залежить від сили волі.",
      [
        {
          id: "stress-course__m1__i1",
          title: "Що таке стрес насправді",
          type: "text",
          isRequired: true,
          durationMinutes: 15,
          body: "Стрес — це не «слабкість» і не брак дисципліни, а автоматична реакція нервової системи на загрозу, реальну чи уявну. Тіло не розрізняє дедлайн на роботі й реальну небезпеку — реагує однаково.",
          // Demo materials on the very first lesson (Sasha's request,
          // 2026-09-28) so the "Додаткові матеріали" section — same
          // fileUrl/audioUrl fields every other lesson already uses,
          // reusing the existing demo PDF from stress-course__m3__i2 —
          // is visible without having to click through to module 3.
          fileUrl: "/demo-materials/stress-course-shchodennyk-sposterezhen.pdf",
          fileName: "Щоденник спостережень.pdf",
          fileSizeLabel: "47 KB",
          audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3",
        },
        { id: "stress-course__m1__i2", title: "Чому тіло реагує швидше за розум", type: "text", isRequired: true, durationMinutes: 20, body: "Реакція «бий/біжи/завмри» запускається мигдалеподібним тілом за частки секунди — раніше, ніж свідомий розум встигає оцінити ситуацію. Тому «просто заспокойся» рідко працює в моменті: тілу потрібен окремий сигнал безпеки." },
      ]
    ),
    m(
      "stress-course__m2",
      "Що відбувається з вами під час напруги",
      "Фізичні та емоційні сигнали напруги — як їх помічати раніше, а не постфактум.",
      [
        {
          id: "stress-course__m2__i1",
          title: "Тілесні сигнали напруги",
          type: "text",
          isRequired: true,
          durationMinutes: 15,
          body: "Прискорене серцебиття, стиснуті щелепи, поверхневе дихання, напруга в плечах — тіло попереджає задовго до того, як напруга стає нестерпною. Помітити ці сигнали раніше — це вже половина роботи.",
          // 2026-09-28: was its own standalone item (stress-course__m2__i3,
          // "Аудіо-практика: заземлення у тілі") — per Sasha, a bonus
          // audio practice should never be its own separate lesson in
          // the module list, only a material attached to the real
          // lesson it belongs to. Folded in here (same audio file), the
          // one existing "secondary audio material" field the item
          // model already supports — rendered by ProgramExperience's
          // "Додаткові матеріали" section, no new field/abstraction.
          audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3",
        },
        {
          id: "stress-course__m2__i2",
          title: "Емоційні прояви стресу",
          type: "text",
          isRequired: true,
          durationMinutes: 15,
          body: "Дратівливість, тривожність, відчуття «на межі» без очевидної причини — часто це саме стрес, а не риса характеру чи «поганий день».",
          practice: {
            type: "checkboxes",
            prompt: "Які з цих проявів ви помічали у себе за останній тиждень?",
            options: ["Дратівливість", "Тривожність", "Відчуття «на межі»", "Труднощі з концентрацією", "Порушення сну"],
          },
        },
      ]
    ),
    m(
      "stress-course__m3",
      "Розпізнаємо власні тригери",
      "Що саме запускає стресову реакцію особисто у вас — і як це відстежувати.",
      [
        { id: "stress-course__m3__i1", title: "Види тригерів", type: "text", isRequired: true, durationMinutes: 20, body: "Тригери бувають зовнішні (дедлайни, конфлікти, шум) і внутрішні (думки, спогади, очікування від себе). У кожної людини — свій особистий набір." },
        {
          id: "stress-course__m3__i2",
          title: "Щоденник спостережень",
          type: "checklist",
          isRequired: true,
          durationMinutes: 20,
          checklist: ["Записати 3 моменти напруги за день", "Відмітити, що їм передувало"],
          // Real downloadable worksheet (public/demo-materials) — a
          // stand-in for what a real author would upload via Supabase
          // Storage (see AuthorCourseEditor's materials upload). fileUrl
          // is a plain root-relative path since this is a static public/
          // asset, not user-uploaded content.
          fileUrl: "/demo-materials/stress-course-shchodennyk-sposterezhen.pdf",
          fileName: "Щоденник спостережень.pdf",
          fileSizeLabel: "47 KB",
        },
      ]
    ),
    m(
      "stress-course__m4",
      "Як повертати себе у стабільний стан",
      "Практичні техніки, які реально знижують напругу в моменті.",
      [
        { id: "stress-course__m4__i1", title: "Що допомагає знизити напругу", type: "text", isRequired: true, durationMinutes: 15, body: "Не існує одного «правильного» способу — але є перевірені: зміна дихання, рух, зміна оточення, контакт з тілом. Мета — знайти свій, а не чужий рецепт." },
        {
          id: "stress-course__m4__i2",
          title: "Техніка дихання",
          type: "video",
          isRequired: true,
          durationMinutes: 10,
          body: "Подовжений видих (наприклад, 4 секунди вдих, 6 секунд видих) напряму заспокоює нервову систему — це не метафора, а фізіологія.",
          // Demo placeholder — a real author would paste their own
          // YouTube link here (same convention as module.videoUrl in
          // AuthorCourseEditor.tsx).
          videoUrl: "https://www.youtube.com/watch?v=7Ep5mKuRmAA",
          // Demo transcript — shows what an author-pasted transcript
          // looks like once rendered (see the collapsible block under
          // the video in ProgramExperience.tsx).
          transcript:
            "Привіт. Сьогодні поговоримо про техніку дихання, яка допомагає швидко заспокоїти нервову систему.\n\nСпробуйте зараз: вдихніть носом на 4 рахунки, а видихніть ротом на 6 рахунків. Видих довший за вдих — саме це подає організму сигнал «небезпеки немає».\n\nПовторіть цей цикл 5-6 разів. Не потрібно робити це ідеально — важливо, що ви взагалі зробили паузу.",
        },
        {
          id: "stress-course__m4__i3",
          title: "Що робити в момент перевантаження",
          type: "text",
          isRequired: true,
          durationMinutes: 10,
          body: "Коли напруга вже на піку, довгі пояснення не працюють — потрібна коротка, конкретна дія: пауза, вода, зміна пози, вихід з кімнати на хвилину.",
          // 2026-09-28: was its own standalone item (stress-course__m4__i5,
          // "Аудіо-практика заспокоєння") — folded into the real lesson
          // it's a bonus practice FOR, same reasoning as m2__i1 above.
          audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
        },
        {
          id: "stress-course__m4__i4",
          title: "Міні-завдання: 5 хвилин практики проживання напруги",
          type: "checklist",
          isRequired: false,
          durationMinutes: 5,
          checklist: ["Знайти тихе місце", "Виконати вправу з попереднього уроку", "Відмітити стан до/після"],
        },
      ]
    ),
    m(
      "stress-course__m5",
      "Робота з думками",
      "Як стрес змінює мислення — і практичні способи повернути ясність.",
      [
        {
          id: "stress-course__m5__i1",
          title: "Автоматичні думки",
          type: "text",
          isRequired: true,
          durationMinutes: 20,
          body: "У стані стресу мозок частіше вибирає найгірший сценарій — це не «правда про ситуацію», а особливість роботи мислення під напругою.",
          // Demo content warning — shows what "Перед початком" looks
          // like once rendered (see the gate in ProgramExperience.tsx).
          contentWarning:
            "Цей матеріал може торкатися тем тривожних думок і панічних атак. Якщо зараз не найкращий момент — можна повернутися пізніше.",
        },
        { id: "stress-course__m5__i2", title: "Як перевіряти думки на реальність", type: "text", isRequired: true, durationMinutes: 15, body: "Просте питання «яким фактом це підтверджується, а яким — спростовується» вже знижує інтенсивність тривожної думки." },
      ]
    ),
    m(
      "stress-course__m6",
      "Як закріпити зміни",
      "Що робити, щоб стан стабільності залишався надовго, а не на кілька днів.",
      [
        { id: "stress-course__m6__i1", title: "Звички стабільності", type: "text", isRequired: true, durationMinutes: 15, body: "Стабільність тримається не на одній вправі, а на кількох маленьких регулярних діях — сон, рух, паузи протягом дня." },
        { id: "stress-course__m6__i2", title: "План на випадок рецидиву", type: "text", isRequired: true, durationMinutes: 15, body: "Напруга повернеться — це нормально. Мати заздалегідь готовий план («що я роблю в перші 10 хвилин») означає не починати з нуля щоразу." },
      ]
    ),
  ],

  "healthy-balance": [
    m("healthy-balance__m1", "Що таке емоційний баланс", "Баланс — це не відсутність емоцій, а вміння з ними жити.", [
      {
        id: "healthy-balance__m1__i1",
        title: "Баланс vs пригнічення емоцій",
        type: "text",
        isRequired: true,
        durationMinutes: 10,
        body: "Баланс часто плутають із придушенням незручних емоцій — «не показувати», «тримати себе в руках». Насправді це протилежні речі: пригнічення забирає енергію, а баланс — це вміння відчути емоцію, назвати її і не застрягнути в ній надовго.",
      },
      {
        id: "healthy-balance__m1__i2",
        title: "Ознаки втраченого балансу",
        type: "text",
        isRequired: true,
        durationMinutes: 10,
        body: "Втрачений баланс рідко виглядає як криза — частіше це постійна втома, дратівливість на дрібниці, відчуття «я ніби відключений/а від себе». Помітити ці ознаки раніше означає встигнути щось змінити до того, як стане важче.",
        practice: {
          type: "scale",
          prompt: "Наскільки збалансовано ви почуваєтесь зараз?",
          scaleMin: 1,
          scaleMax: 10,
          scaleLabels: ["Виснажено", "Наповнено"],
        },
      },
    ]),
    m("healthy-balance__m2", "Практики усвідомленості", "Прості вправи, які можна робити щодня за кілька хвилин.", [
      {
        id: "healthy-balance__m2__i1",
        title: "Дихальні техніки",
        type: "text",
        isRequired: true,
        durationMinutes: 15,
        body: "Дихання — єдина автоматична функція тіла, яку можна свідомо контролювати, тому це найшвидший доступний спосіб вплинути на нервову систему в моменті, без жодного спеціального обладнання чи підготовки.",
      },
      {
        id: "healthy-balance__m2__i2",
        title: "Коротка медитація на день",
        type: "audio",
        isRequired: true,
        durationMinutes: 10,
        body: "Коротка аудіо-практика на кілька хвилин — не заміна повноцінної медитації, а спосіб зробити паузу серед дня, коли часу на щось довше просто немає.",
        audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
      },
    ]),
    m("healthy-balance__m3", "Підтримка внутрішнього ресурсу", "Де брати енергію і як помічати виснаження до того, як стане критично.", [
      {
        id: "healthy-balance__m3__i1",
        title: "Джерела енергії",
        type: "text",
        isRequired: true,
        durationMinutes: 10,
        body: "Енергія береться не лише зі сну — спілкування, творчість, рух, тиша по-різному наповнюють різних людей. Знати свої особисті джерела важливіше, ніж намагатися відновлюватись за чужим рецептом.",
      },
      {
        id: "healthy-balance__m3__i2",
        title: "Як помічати виснаження вчасно",
        type: "text",
        isRequired: true,
        durationMinutes: 10,
        body: "Виснаження рідко приходить різко — воно накопичується непомітно, поки не стає надто явним, щоб ігнорувати. Регулярно перевіряти свій стан, а не чекати «дна», — це і є профілактика вигорання.",
      },
    ]),
    m("healthy-balance__m4", "Стабільність у щоденному житті", "Як перенести практики з курсу у звичайний день.", [
      {
        id: "healthy-balance__m4__i1",
        title: "Ритуали стабільності",
        type: "text",
        isRequired: true,
        durationMinutes: 10,
        body: "Ритуал — це не про ідеальну дисципліну, а про маленьку повторювану дію, яка дає тілу й розуму сигнал «зараз усе під контролем», навіть коли решта дня непередбачувана.",
      },
      {
        id: "healthy-balance__m4__i2",
        title: "План підтримки на тиждень",
        type: "checklist",
        isRequired: true,
        durationMinutes: 10,
        checklist: ["Обрати 2 практики на щодня", "Записати свій план на 7 днів", "Відмітити, що спрацювало найкраще"],
        // Demo placeholder PDF — same reused asset as stress-course's
        // materials block (public/demo-materials), just relabeled.
        fileUrl: "/demo-materials/stress-course-shchodennyk-sposterezhen.pdf",
        fileName: "План підтримки на тиждень.pdf",
        fileSizeLabel: "47 KB",
      },
    ]),
  ],

  "self-esteem-course": [
    m("self-esteem-course__m1", "Звідки береться самооцінка", "Як формується ставлення до себе — і чому це не про силу волі.", [
      {
        id: "self-esteem-course__m1__i1",
        title: "Джерела самооцінки в дитинстві",
        type: "text",
        isRequired: true,
        durationMinutes: 15,
        body: "Ставлення до себе формується задовго до того, як людина усвідомлено починає ним керувати — з того, як реагували на її успіхи, помилки й прояви емоцій у дитинстві. Це не вирок, а пояснення, чому «просто повірити в себе» рідко працює саме собою.",
      },
      {
        id: "self-esteem-course__m1__i2",
        title: "Самооцінка vs самокритика",
        type: "text",
        isRequired: true,
        durationMinutes: 15,
        body: "Самокритика часто маскується під «мотивацію» чи «реалізм», але постійне знецінення власних дій виснажує, а не рухає вперед. Здорова самооцінка не означає бачити себе ідеальним — вона означає бачити себе чесно, без постійного знецінення.",
      },
    ]),
    m("self-esteem-course__m2", "Внутрішній критик", "Голос, який оцінює кожен крок, — звідки він і що з ним робити.", [
      {
        id: "self-esteem-course__m2__i1",
        title: "Як розпізнати внутрішнього критика",
        type: "text",
        isRequired: true,
        durationMinutes: 20,
        body: "Внутрішній критик рідко звучить як окремий «голос» — частіше це автоматична думка на кшталт «я знову все зіпсував/ла», яка проскакує так швидко, що здається просто фактом, а не оцінкою.",
        practice: {
          type: "text",
          prompt: "Яку фразу найчастіше каже ваш внутрішній критик?",
        },
      },
      {
        id: "self-esteem-course__m2__i2",
        title: "Що на нього відповідати",
        type: "text",
        isRequired: true,
        durationMinutes: 15,
        body: "Мета не в тому, щоб заглушити внутрішнього критика чи сперечатися з ним щоразу, а в тому, щоб мати готову, спокійну відповідь — щось на кшталт «я чую це, але це не факт, а звичка».",
      },
    ]),
    m("self-esteem-course__m3", "Формування підтримки", "Як говорити з собою так, щоб це справді допомагало.", [
      {
        id: "self-esteem-course__m3__i1",
        title: "Внутрішня опора",
        type: "text",
        isRequired: true,
        durationMinutes: 15,
        body: "Внутрішня опора — це не про постійну впевненість, а про здатність залишатися на своєму боці навіть тоді, коли щось не вдалося. Коротка аудіо-практика нижче допомагає відчути цю опору тілесно, а не лише зрозуміти її розумом.",
        // Demo placeholder audio practice (public SoundHelix track) —
        // same convention as stress-course/mindfulness-course's audio
        // items.
        audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
      },
      {
        id: "self-esteem-course__m3__i2",
        title: "Як хвалити себе екологічно",
        type: "text",
        isRequired: true,
        durationMinutes: 15,
        body: "Екологічна похвала — конкретна й чесна («я впорався з важким дзвінком»), а не загальна й перебільшена («я найкращий у всьому»). Саме конкретність робить її переконливою навіть для людини, яка звикла собі не вірити.",
      },
    ]),
    m("self-esteem-course__m4", "Стійка самооцінка", "Самооцінка, яка не залежить від чужої думки чи результату дня.", [
      {
        id: "self-esteem-course__m4__i1",
        title: "Самооцінка, що не залежить від інших",
        type: "text",
        isRequired: true,
        durationMinutes: 15,
        body: "Поки самооцінка тримається на чужих оцінках чи результатах дня, вона нестабільна за визначенням — завжди буде день без похвали чи з невдачею. Стійкість з'являється, коли опора переміщується всередину.",
      },
      {
        id: "self-esteem-course__m4__i2",
        title: "План підтримки",
        type: "checklist",
        isRequired: true,
        durationMinutes: 10,
        checklist: ["Записати 3 свої сильні сторони", "Обрати одну щоденну практику підтримки", "Переглядати список раз на тиждень"],
        fileUrl: "/demo-materials/stress-course-shchodennyk-sposterezhen.pdf",
        fileName: "План підтримки.pdf",
        fileSizeLabel: "47 KB",
      },
    ]),
  ],

  "relationships-course": [
    m("relationships-course__m1", "Що таке здорові стосунки", "Як відрізнити здорову динаміку від токсичних патернів.", [
      {
        id: "relationships-course__m1__i1",
        title: "Ознаки здорових стосунків",
        type: "text",
        isRequired: true,
        durationMinutes: 15,
        body: "Здорові стосунки не означають відсутність конфліктів — вони означають, що конфлікт можна пережити разом, не втрачаючи поваги одне до одного і не боячись бути собою.",
      },
      {
        id: "relationships-course__m1__i2",
        title: "Ознаки токсичних патернів",
        type: "text",
        isRequired: true,
        durationMinutes: 15,
        body: "Токсичний патерн не завжди виглядає як відкритий конфлікт — частіше це постійне відчуття, що доводиться підлаштовуватись, вибачатись за власні потреби або ходити «навшпиньках» у власних стосунках.",
      },
    ]),
    m("relationships-course__m2", "Особисті кордони", "Як визначити свої межі — і як про них говорити без почуття провини.", [
      {
        id: "relationships-course__m2__i1",
        title: "Як визначити свої кордони",
        type: "text",
        isRequired: true,
        durationMinutes: 20,
        body: "Кордони — це не список заборон для інших, а чітке розуміння того, що для вас прийнятно, а що ні. Без цього розуміння важко пояснити межу навіть собі, не кажучи вже про інших людей.",
        practice: {
          type: "choice",
          prompt: "Що вам зараз найважче витримувати у спілкуванні з іншими?",
          options: ["Говорити «ні»", "Просити про допомогу", "Витримувати чужу образу", "Відстоювати свою думку"],
        },
      },
      {
        id: "relationships-course__m2__i2",
        title: "Як говорити про кордони",
        type: "text",
        isRequired: true,
        durationMinutes: 20,
        body: "Говорити про кордони спокійно, без виправдань і без звинувачень — окрема навичка, яка тренується. Шаблон нижче допоможе сформулювати межу так, щоб її було легше почути.",
        // Demo placeholder PDF (reused stress-course asset) — a
        // worksheet template for writing down your own boundaries.
        fileUrl: "/demo-materials/stress-course-shchodennyk-sposterezhen.pdf",
        fileName: "Шаблон особистих кордонів.pdf",
        fileSizeLabel: "47 KB",
      },
    ]),
    m("relationships-course__m3", "Комунікація без звинувачень", "Як говорити про складне так, щоб вас почули, а не почули захист.", [
      {
        id: "relationships-course__m3__i1",
        title: "Я-повідомлення",
        type: "text",
        isRequired: true,
        durationMinutes: 20,
        body: "«Ти завжди...» майже гарантовано викликає захисну реакцію у відповідь. «Я відчуваю...» описує ваш власний досвід, а не звинувачує — і саме тому його легше почути, не займаючи оборонну позицію.",
        // Demo placeholder audio practice.
        audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3",
      },
      {
        id: "relationships-course__m3__i2",
        title: "Як говорити про складне",
        type: "text",
        isRequired: true,
        durationMinutes: 20,
        body: "Складну розмову легше почати, якщо заздалегідь обрати момент (не в розпал сварки), сформулювати одну конкретну тему і бути готовим слухати у відповідь, а не лише говорити.",
      },
    ]),
    m("relationships-course__m4", "Конфлікти та їх вирішення", "Конфлікт — це не загроза стосункам, якщо вміти з ним працювати.", [
      {
        id: "relationships-course__m4__i1",
        title: "Природа конфлікту",
        type: "text",
        isRequired: true,
        durationMinutes: 15,
        body: "Конфлікт сам по собі не руйнує стосунки — їх руйнує те, як з ним поводяться: мовчання, накопичена образа, перехід на особистості. Конфлікт, прожитий чесно, часто зближує, а не віддаляє.",
      },
      {
        id: "relationships-course__m4__i2",
        title: "Як виходити з конфлікту разом",
        type: "text",
        isRequired: true,
        durationMinutes: 20,
        body: "Мета в конфлікті — не «перемогти», а знайти рішення, яке влаштовує обох. Це часто означає визнати свою частину відповідальності першим, навіть коли здається, що правда повністю на вашому боці.",
      },
    ]),
    m("relationships-course__m5", "Довіра та близькість", "Як відновлювати довіру і підтримувати близькість з часом.", [
      {
        id: "relationships-course__m5__i1",
        title: "Як відновлювати довіру",
        type: "text",
        isRequired: true,
        durationMinutes: 15,
        body: "Довіра відновлюється не одним великим жестом, а серією маленьких послідовних дій, які підтверджують слова. Це повільний процес, і поспіх тут зазвичай лише шкодить.",
      },
      {
        id: "relationships-course__m5__i2",
        title: "Підтримка близькості з часом",
        type: "text",
        isRequired: true,
        durationMinutes: 15,
        body: "Близькість у довгих стосунках не тримається сама по собі — вона потребує регулярної уваги: щирих розмов, спільного часу без відволікань, готовності далі цікавитись одне одним.",
      },
    ]),
  ],

  "mindfulness-course": [
    m("mindfulness-course__m1", "Що таке усвідомленість", "Усвідомленість — це навичка, а не риса характеру.", [
      { id: "mindfulness-course__m1__i1", title: "Усвідомленість vs автопілот", type: "text", isRequired: true, durationMinutes: 15, body: "Більшість дня людина проживає «на автопілоті» — думками не тут. Усвідомленість — це просто вміння частіше помічати, де зараз твоя увага, і повертати її." },
      { id: "mindfulness-course__m1__i2", title: "Наукова основа практики", type: "text", isRequired: true, durationMinutes: 10, body: "Регулярна практика уваги пов'язана зі зниженням реактивності на стрес і покращенням концентрації — це підтверджено дослідженнями, а не лише суб'єктивним відчуттям." },
    ]),
    m("mindfulness-course__m2", "Практика уваги до тіла", "Тіло — найшвидший спосіб повернути увагу в теперішній момент.", [
      {
        id: "mindfulness-course__m2__i1",
        title: "Сканування тіла",
        type: "audio",
        isRequired: true,
        durationMinutes: 15,
        body: "Повільне сканування тіла від голови до стоп — одна з базових практик усвідомленості. Мета не в тому, щоб розслабитись за будь-яку ціну, а в тому, щоб просто помітити, що зараз відчуває тіло, без оцінки.",
        audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
      },
      {
        id: "mindfulness-course__m2__i2",
        title: "Усвідомлене дихання",
        type: "audio",
        isRequired: true,
        durationMinutes: 15,
        body: "Дихання завжди відбувається в теперішньому моменті — саме тому увага до нього такий надійний якір, коли думки розбігаються. Ця практика не про «правильне» дихання, а про спостереження за ним таким, яке воно є.",
        audioUrl: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
      },
    ]),
    m("mindfulness-course__m3", "Усвідомленість у щоденних справах", "Як практикувати усвідомленість без окремого часу на медитацію.", [
      {
        id: "mindfulness-course__m3__i1",
        title: "Усвідомлене харчування",
        type: "text",
        isRequired: true,
        durationMinutes: 10,
        body: "Їсти без телефону й екрана, помічаючи смак і текстуру — маленька, але реальна практика, яка не потребує окремого часу в графіку.",
        // Demo placeholder PDF (reused stress-course asset).
        fileUrl: "/demo-materials/stress-course-shchodennyk-sposterezhen.pdf",
        fileName: "Гайд усвідомленого харчування.pdf",
        fileSizeLabel: "47 KB",
      },
      { id: "mindfulness-course__m3__i2", title: "Усвідомлена ходьба", type: "text", isRequired: true, durationMinutes: 15, body: "Звичайна прогулянка стає практикою, якщо кілька хвилин приділити відчуттям у тілі й контакту стопи з землею замість прокручування думок." },
    ]),
    m("mindfulness-course__m4", "Робота з відволіканням", "Чому концентрація губиться — і як її повертати без боротьби з собою.", [
      { id: "mindfulness-course__m4__i1", title: "Чому концентрація губиться", type: "text", isRequired: true, durationMinutes: 15, body: "Відволікання — це не «слабка воля», а нормальна властивість уваги. Мета не в тому, щоб відволікань не було, а в тому, щоб швидше їх помічати." },
      {
        id: "mindfulness-course__m4__i2",
        title: "Практики повернення уваги",
        type: "text",
        isRequired: true,
        durationMinutes: 15,
        body: "Найпростіший спосіб — м'яко, без самокритики, повертати увагу до одного орієнтира (дихання, звук, відчуття) щоразу, коли помічаєш, що відволікся.",
        practice: {
          type: "scale",
          prompt: "Наскільки легко вам було утримувати увагу під час цієї вправи?",
          scaleMin: 1,
          scaleMax: 5,
          scaleLabels: ["Складно", "Легко"],
        },
      },
    ]),
    m("mindfulness-course__m5", "Усвідомленість та емоції", "Як спостерігати за емоціями, не застрягаючи в реакції на них.", [
      { id: "mindfulness-course__m5__i1", title: "Спостереження за емоціями без осудження", type: "text", isRequired: true, durationMinutes: 15, body: "Емоцію можна помітити й назвати («це роздратування»), не оцінюючи себе за неї — це вже знижує її інтенсивність." },
      { id: "mindfulness-course__m5__i2", title: "Як не застрягати в реакції", type: "text", isRequired: true, durationMinutes: 15, body: "Між емоцією і дією завжди є коротка пауза — практика усвідомленості робить цю паузу помітною й доступною для вибору." },
    ]),
    m("mindfulness-course__m6", "Інтеграція практики", "Як зробити усвідомленість стабільною звичкою, а не разовим експериментом.", [
      { id: "mindfulness-course__m6__i1", title: "Як зробити практику стабільною звичкою", type: "text", isRequired: true, durationMinutes: 15, body: "Коротка щоденна практика (навіть 3–5 хвилин) працює краще за рідкісні довгі сесії — регулярність важливіша за тривалість." },
      { id: "mindfulness-course__m6__i2", title: "Що робити, якщо мотивація падає", type: "text", isRequired: true, durationMinutes: 15, body: "Мотивація природно коливається — план на цей випадок (мінімальна версія практики на 1 хвилину) допомагає не кидати все повністю." },
    ]),
  ],
};

// First-run seed for the demo participant's item progress (see
// utils/demoProgressStore.ts) — hand-authored to agree with the story
// already told elsewhere (ParticipantOverview's "next step",
// participantDashboard.ts's enrollments): mindfulness-course is mid-way
// through its 4th of 6 modules, stress-course is fully completed. The
// other 3 demo programs have no enrollment at all, so no seed entry —
// an absent contentId means "not started", which computeProgress
// already treats correctly (0%, no current position needed until
// opened for the first time).
export const demoSeedProgress: Record<string, ItemProgressMap> = {
  "stress-course": Object.fromEntries(
    programModules["stress-course"].flatMap((mod) => mod.items.map((i) => [i.id, "completed" as const]))
  ),
  "mindfulness-course": {
    "mindfulness-course__m1__i1": "completed",
    "mindfulness-course__m1__i2": "completed",
    "mindfulness-course__m2__i1": "completed",
    "mindfulness-course__m2__i2": "completed",
    "mindfulness-course__m3__i1": "completed",
    "mindfulness-course__m3__i2": "completed",
    "mindfulness-course__m4__i1": "completed",
    "mindfulness-course__m4__i2": "in_progress",
    // modules 5–6 intentionally absent -> not_started
  },
};
