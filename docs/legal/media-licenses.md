# Перелік ліцензій на медіа платформи (юрист, 22.11.2026, 4.5)

Що потрібно від кожного файлу:
- дозвіл на **комерційне** використання;
- дозвіл на використання у творах інших людей (медитаціях авторів);
- дозвіл на **завантаження** готового міксу покупцем.

Не підходять ліцензії CC BY-NC (некомерційна) і «лише для особистого використання». CC BY підходить, але вимагає вказати автора.

## Фонові звуки «Студії медитацій» (`src/data/meditationBackgroundSounds.ts`)

Файли лежать у сховищі Sensoria (`content-files`). За назвами файлів (`автор-назва-номер.mp3`) це завантаження з **Pixabay**: [Pixabay Content License](https://pixabay.com/service/license-summary/) дозволяє комерційне використання без зазначення автора, але **забороняє продавати чи поширювати файл окремо, без змін**. У медитації звук іде міксом з голосом автора, тож це «зміна». **Власниці підтвердити**, що всі файли завантажено саме з Pixabay, і зберегти посилання на сторінки.

| Файл | Ймовірне джерело | Ліцензія | Сторінка (заповнити) |
|---|---|---|---|
| dragon-studio-copyright-free-rain-sounds-331497.mp3 (дощ) | Pixabay, dragon-studio | Pixabay Content License | |
| audiopapkin-forest-ambience-296528.mp3 (ліс) | Pixabay, audiopapkin | Pixabay Content License | |
| freesound_community-water-ocean-waves-01-58360.mp3 (море) | Pixabay, freesound_community | Pixabay Content License (перевірити першоджерело на Freesound: CC0 чи CC BY) | |
| king_of_the_christmas-fireplace-loop-original-noise-178209.mp3 (вогонь) | Pixabay, king_of_the_christmas | Pixabay Content License | |
| sigmamusicart-meditation-music-368634.mp3 (музика) | Pixabay, SigmaMusicArt | Pixabay Content License | |
| velariomusic-meditation-music-603880.mp3 (музика) | Pixabay, VelarioMusic | Pixabay Content License | |
| velariomusic-meditation-background-603870.mp3 (музика) | Pixabay, VelarioMusic | Pixabay Content License | |
| andriig-meditation-meditation-music-581020.mp3 (музика) | Pixabay, AndriiG | Pixabay Content License | |

Музика на Pixabay інколи зареєстрована в Content ID (YouTube). Для сайту це не перешкода, але автор, який викладе медитацію з такою музикою на YouTube, може отримати претензію. Варто сказати про це в довідці автора.

## «Конструктор обкладинок» (`src/components/author/CoverMaker.tsx`, `coverRender.ts`)

Сторонніх зображень немає. Обкладинки малюються в коді: градієнти, фігури, шрифти сайту. Ліцензія потрібна лише на шрифти: перевірити, що вони з Google Fonts (ліцензія OFL, комерційне використання дозволене).

## Голос демо-медитації «Швидке заземлення»

Запис ElevenLabs (голос «Sofiia»). Умови ElevenLabs дозволяють комерційне використання лише на **платному** тарифі. Підтвердити, що запис зроблено на платному тарифі.
