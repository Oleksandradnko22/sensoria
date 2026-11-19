-- Хеші текстів після правок 20.11.2026 (оферта Б39а, Б43–Б45; Політика П16; Угода учасника п. 9.3).
-- Редакція лишається 1.0: змінюється лише відбиток тексту, повторної згоди не потрібно. Ідемпотентно.
update public.legal_documents set text_hash = 'd5169e71e353f3b6c634017e6041750eeb129220d2d55c844c2dcada3ee5ce4f' where document = 'participant_agreement' and is_current;
update public.legal_documents set text_hash = 'a297fb88d6b8249cee962031f8f6718e5e6155bee4ad147a35aa7d3932fb0a8f' where document = 'author_agreement' and is_current;
update public.legal_documents set text_hash = '281381958ac105379f5bdaa0f9e9d301e30490961682379d0ca4e4c5db0fcff5' where document = 'privacy' and is_current;
