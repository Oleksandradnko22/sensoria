-- Хеші текстів після правок 20.11.2026: оферта Б39а, Б43–Б45; Політика П16; Угода учасника п. 9.3;
-- Б46 — реквізити (місцезнаходження й адреса для листування, зокрема для претензій) в оферті, Умовах, Угоді й Політиці.
-- Редакція лишається 1.0: змінюється лише відбиток тексту, повторної згоди не потрібно. Ідемпотентно.
update public.legal_documents set text_hash = '43639290eb0ca84adf31c3e9711892dbe1c986812ea7d6599eec7f600cb620fe' where document = 'participant_agreement' and is_current;
update public.legal_documents set text_hash = '00894472c48d41c224d03c020d666a6bb5329280808e3ed02c8bfd2bc996b233' where document = 'author_agreement' and is_current;
update public.legal_documents set text_hash = 'e57c494f283113538d3d534efac3703c771a7d62ac999e14e83c41d096e64ca3' where document = 'terms' and is_current;
update public.legal_documents set text_hash = 'f66026379b70f001978966db56ce6aea5736302adc9258c41a3854d913a42695' where document = 'privacy' and is_current;
