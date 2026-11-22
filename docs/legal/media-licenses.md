# Перелік ліцензій на медіа платформи (юрист, 22.11.2026, 4.5)

Що потрібно від кожного файлу:
- дозвіл на **комерційне** використання;
- дозвіл на використання у творах інших людей (медитаціях авторів);
- дозвіл на **завантаження** готового міксу покупцем.

Не підходять ліцензії CC BY-NC (некомерційна) і «лише для особистого використання». CC BY підходить, але вимагає вказати автора.

## Фонові звуки «Студії медитацій» (`src/data/meditationBackgroundSounds.ts`)

Файли лежать у сховищі Sensoria (`content-files`). За назвами файлів (`автор-назва-номер.mp3`) це завантаження з **Pixabay**: [Pixabay Content License](https://pixabay.com/service/license-summary/) дозволяє комерційне використання без зазначення автора, але **забороняє продавати чи поширювати файл окремо, без змін**. У медитації звук іде міксом з голосом автора, тож це «зміна». **Перевірено 22.11.2026:** усі 8 сторінок існують на Pixabay, ліцензія — Pixabay Content License (посилання в таблиці). Чотири музичні треки позначені «Content ID Registered», два треки VelarioMusic — «AI generated». Звук моря завантажено на Pixabay з Freesound (автор sengjinn).

| Файл | Ймовірне джерело | Ліцензія | Сторінка (заповнити) |
|---|---|---|---|
| dragon-studio-copyright-free-rain-sounds-331497.mp3 (дощ) | Pixabay, dragon-studio | Pixabay Content License | https://pixabay.com/sound-effects/copyright-free-rain-sounds-331497/ |
| audiopapkin-forest-ambience-296528.mp3 (ліс) | Pixabay, audiopapkin | Pixabay Content License | https://pixabay.com/sound-effects/forest-ambience-296528/ |
| freesound_community-water-ocean-waves-01-58360.mp3 (море) | Pixabay, freesound_community | Pixabay Content License (перевірити першоджерело на Freesound: CC0 чи CC BY) | https://pixabay.com/sound-effects/water-ocean-waves-01-58360/ |
| king_of_the_christmas-fireplace-loop-original-noise-178209.mp3 (вогонь) | Pixabay, king_of_the_christmas | Pixabay Content License | https://pixabay.com/sound-effects/fireplace-loop-original-noise-178209/ |
| sigmamusicart-meditation-music-368634.mp3 (музика) | Pixabay, SigmaMusicArt | Pixabay Content License | https://pixabay.com/music/meditation-music-368634/ |
| velariomusic-meditation-music-603880.mp3 (музика) | Pixabay, VelarioMusic | Pixabay Content License | https://pixabay.com/music/meditation-music-603880/ |
| velariomusic-meditation-background-603870.mp3 (музика) | Pixabay, VelarioMusic | Pixabay Content License | https://pixabay.com/music/meditation-background-603870/ |
| andriig-meditation-meditation-music-581020.mp3 (музика) | Pixabay, AndriiG | Pixabay Content License | https://pixabay.com/music/meditation-meditation-music-581020/ |

Музика на Pixabay інколи зареєстрована в Content ID (YouTube). Для сайту це не перешкода, але автор, який викладе медитацію з такою музикою на YouTube, може отримати претензію. Варто сказати про це в довідці автора.

## «Конструктор обкладинок» (`src/components/author/CoverMaker.tsx`, `coverRender.ts`)

Сторонніх зображень немає. Обкладинки малюються в коді: градієнти, фігури, шрифти сайту. Ліцензія потрібна лише на шрифти: перевірити, що вони з Google Fonts (ліцензія OFL, комерційне використання дозволене).

## Голос демо-медитації «Швидке заземлення»

Запис ElevenLabs (голос «Sofiia»), зроблений на **безкоштовному** тарифі (власниця, 22.11.2026). За умовами ElevenLabs безкоштовний тариф не дає права на комерційне використання й вимагає вказувати ElevenLabs. Sensoria — комерційна платформа, тож цей запис треба замінити до запуску:
- згенерувати заново на платному тарифі (Starter і вище; права дає тариф на момент генерації);
- або записати голос самостійно;
- або прибрати аудіо й лишити текстову практику.
