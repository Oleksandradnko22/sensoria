-- Хеші текстів після правок 20.11.2026: оферта Б39а, Б43–Б45; Політика П16; Угода учасника п. 9.3;
-- Б44 без речення про партнерську винагороду Checkbox; Б46 — реквізити (місцезнаходження й адреса для листування, зокрема для претензій) в оферті, Умовах, Угоді й Політиці;
-- аудит А2–А3 — у Політиці відео YouTube/Vimeo й тест до реєстрації.
-- Редакція лишається 1.0: змінюється лише відбиток тексту, повторної згоди не потрібно. Ідемпотентно.
update public.legal_documents set text_hash = '43639290eb0ca84adf31c3e9711892dbe1c986812ea7d6599eec7f600cb620fe' where document = 'participant_agreement' and is_current;
update public.legal_documents set text_hash = 'f35d4ab5239a463d5906ba8d107cf0fd8c054732d34dec88a74a6188c4102928' where document = 'author_agreement' and is_current;
update public.legal_documents set text_hash = 'e57c494f283113538d3d534efac3703c771a7d62ac999e14e83c41d096e64ca3' where document = 'terms' and is_current;
update public.legal_documents set text_hash = 'aa96f1f387414b90e06f5f1ef1f9528e2d36fd9aed3468a4ad487a90a3a26c99' where document = 'privacy' and is_current;
