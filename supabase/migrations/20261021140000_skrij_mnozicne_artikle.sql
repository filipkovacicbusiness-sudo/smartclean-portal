-- ════════════════════════════════════════════════════════════════════════
--  64_skrij_mnozicne_artikle.sql — ENKRATNO: skrije v aplikaciji artikle, ki so
--  bili množično dodani in jih stranka ni nikoli uporabila
--
--  Stolpec articles.viden_app je imel privzeto vrednost TRUE, zato so skupna
--  dodajanja v portalu (splošni cenik, skupine, uvoz) artikle pokazala na
--  tablici VSEM strankam (npr. Krilo in Obleka 23. 9. pri 29 strankah). Portal
--  4.27 to pri novih dodajanjih že preprečuje; ta migracija pospravi stare.
--
--  Seznam (160 artiklov, 38 strank) je bil pregledan in potrjen 21. 10. 2026:
--  ustvarjeni od 1. 9. 2026 v množičnem dodajanju (isti naziv pri ≥3 strankah v
--  isti minuti ali ≥10 artiklov ene stranke naenkrat) in brez kakršne koli
--  uporabe na spremnem listu te stranke. Ročno dodani artikli ostanejo vidni.
--
--  Ob zagonu se vsak artikel še enkrat preveri (še viden, še neuporabljen).
--  Skriti ID-ji se shranijo v app.viden_app_kopija. Razveljavitev:
--    update public.articles set viden_app = true
--    where id in (select article_id from app.viden_app_kopija);
--  Ko artikel kdo vpiše na list, ga sprožilec trg_razkrij_artikel spet pokaže.
--
--  Varno za ponoven zagon (že shranjenih ne obdela znova).
-- ════════════════════════════════════════════════════════════════════════

create table if not exists app.viden_app_kopija (
  article_id uuid primary key,
  skrito_at  timestamptz not null default now(),
  razlog     text
);
alter table app.viden_app_kopija enable row level security;
revoke all on table app.viden_app_kopija from public, anon, authenticated;

with kandidati(id) as (values
  ('025bc438-e6b8-4718-9e68-9e47e1f6adea'::uuid),
  ('04237190-2b71-468b-a674-392d4815253b'::uuid),
  ('045652b8-6aaf-4bcc-b128-6f0b3462068d'::uuid),
  ('0484823d-bf1b-4d31-ab4d-c4259e228e4d'::uuid),
  ('07630ee9-6f1d-4532-afcb-1d89aff7166f'::uuid),
  ('07e12fcc-d308-4189-bb30-572c9e0338b1'::uuid),
  ('094b8660-8d27-4296-b199-0e0ac72f68c3'::uuid),
  ('09f6487a-384a-4877-84d0-d8c221a78da0'::uuid),
  ('0a9e645a-97e7-42a2-b4fe-952e9da29ae9'::uuid),
  ('0bd1d6a0-2320-40aa-b7b6-178b18e3b1dc'::uuid),
  ('0c2679c4-3dd3-4043-a0ec-3438d86b1804'::uuid),
  ('0d0a0d22-d629-4adb-a1bc-ac50e815ec76'::uuid),
  ('0fa829cf-7a35-4eeb-8c1c-6458afe8aabb'::uuid),
  ('0fb7f672-a8db-4112-950d-1f694f101f73'::uuid),
  ('1129f1c6-f787-4ae6-8715-40ccbfc47f8c'::uuid),
  ('11bfcc14-5632-487a-93bd-5019b3401192'::uuid),
  ('1221b2f0-6a77-4ecf-bc98-1cafdf2177f8'::uuid),
  ('14cd0926-a3f8-49c5-a4cc-bdf693e4c061'::uuid),
  ('1623f2c7-b994-474d-9c0d-4b8a89e48038'::uuid),
  ('17fee591-5532-4e96-b8a0-e3707f58d2d1'::uuid),
  ('1d177951-ec8d-44a3-b4ff-4f021efb40e8'::uuid),
  ('1d4a2994-bf8d-40ca-907f-002cf1f5dc19'::uuid),
  ('1e304448-5589-4718-9b27-ee9f1da22ed3'::uuid),
  ('1fba37e8-b9e4-4041-aee6-433bc68b266b'::uuid),
  ('21c21af3-326d-4ce6-aaa0-7ab2dad8d44c'::uuid),
  ('22d0657e-7a27-4669-b642-ce2ec1ca2c93'::uuid),
  ('2367a118-aa57-470b-a64a-3bdac58b5790'::uuid),
  ('24c24d9f-6ecb-4387-b10e-5eb0704a8fdd'::uuid),
  ('25ca5c56-35db-49ee-865c-cbc9732ed32b'::uuid),
  ('26947638-f4bd-456b-8b07-90d86812353a'::uuid),
  ('2857c8c5-2fad-4feb-b6b6-1492e9a016bd'::uuid),
  ('2960c836-a949-4e7f-a227-18b66f11c5f1'::uuid),
  ('296cae8a-58d9-4da5-a99f-3d687e2e5c71'::uuid),
  ('2b2223f9-b9e4-40e2-a68b-9965bccffb40'::uuid),
  ('2d5b1633-0070-4799-a1f3-23f1d27a25a4'::uuid),
  ('2de0d192-92b6-4760-8c0e-d17a676b4fb1'::uuid),
  ('2f7f2d04-10f0-410b-8629-0fc0bfeae3d5'::uuid),
  ('341adbde-eaf5-4608-8adb-faf8ee30bfa1'::uuid),
  ('34645e7e-d995-4eed-831a-122916b8f3c0'::uuid),
  ('38ac93d5-5591-4570-a410-d79a47abdd21'::uuid),
  ('3980d014-6abb-4cde-8cf9-95a86b581245'::uuid),
  ('3a93f7ae-f511-48c5-a27a-24eda0a3305a'::uuid),
  ('3bfd7e14-3c49-481b-b99f-235c556404fd'::uuid),
  ('40fbaeb0-4699-4ffa-b2e8-01dd68c96c38'::uuid),
  ('4156aa37-d3c6-4104-a02d-d22f2dc3095e'::uuid),
  ('41bb22d0-63d7-4c2e-966f-4d2c57f3b023'::uuid),
  ('421d021c-bd6a-48e6-ac60-92427a82053b'::uuid),
  ('426045fb-53fc-4290-9aa9-7e58a0625973'::uuid),
  ('45042c1a-64a1-4147-929a-4b42ac273fb8'::uuid),
  ('46a4506c-58eb-43d6-8318-fec717946654'::uuid),
  ('46dca68a-e1e7-46b4-9991-036fef333b12'::uuid),
  ('4706610c-ddde-4f36-8159-8812ceea0c45'::uuid),
  ('47dbe8bc-f013-4d2d-b750-b3dfcd24b92d'::uuid),
  ('4869a478-47c5-4474-a533-7c302b0347c1'::uuid),
  ('49a83782-ac48-4781-a800-271a2dad68dd'::uuid),
  ('4a877e9c-b201-4922-932a-6b9aabea7ece'::uuid),
  ('4afe2b6e-e3bf-4a25-8736-2d78c45a75aa'::uuid),
  ('4d5ab442-d458-412b-88e6-30cb429b9677'::uuid),
  ('4dbb443c-2807-4851-afea-c6b95f648e56'::uuid),
  ('50ca4ff3-1b54-4f0d-bdc5-5b948a347d63'::uuid),
  ('51cffa31-00a4-4c1f-9751-c2667a74a0cb'::uuid),
  ('525f3d95-e4cc-4382-9bbd-d350afec1de6'::uuid),
  ('53ed7923-cf76-4662-b750-3327ce2d38d9'::uuid),
  ('54d22068-a41e-4031-935e-d1afaac3739b'::uuid),
  ('5597d473-650e-46dd-a8a1-9a4e250db04b'::uuid),
  ('5a9cd1e3-a4d2-49cd-ac21-93ba28db4718'::uuid),
  ('5c9f9bcc-b22b-4cc9-9f29-98b93c6a867e'::uuid),
  ('5e3c3bb5-1ce8-46ee-8b05-8c0c5ce1d09d'::uuid),
  ('5e6cf215-bfd7-4299-b6c7-6b4dc7906191'::uuid),
  ('5edac89d-f76c-45f2-9a8c-dfe6dd0cb4ee'::uuid),
  ('5f2c4e85-e143-4905-8447-07445b3587f8'::uuid),
  ('5f87db81-06ec-4ad2-bc5f-6b0c8d8b5537'::uuid),
  ('61b1645e-67ab-405c-b0fa-0c50c6a97268'::uuid),
  ('640aa0d0-6f78-441c-8aee-c35d3c616413'::uuid),
  ('644a1b54-232d-4629-aba1-51e1cb790893'::uuid),
  ('6653e147-5274-4e30-8a99-baccdae73a76'::uuid),
  ('66962a32-2b7f-48ef-9dd2-f930e3760b97'::uuid),
  ('68e123da-3bca-44f9-bef0-56222074f8b3'::uuid),
  ('6ee307b9-f234-4b92-8fa1-2da603f37914'::uuid),
  ('71b109ae-66be-44fa-b6c8-c6367b47f08a'::uuid),
  ('77a4b610-6119-4dde-a5c4-44c9ae07b6ed'::uuid),
  ('78e4c4e7-33e0-432d-9395-8ec0092cf40b'::uuid),
  ('7afebafd-18e5-4e29-8ddb-d134f3ee7977'::uuid),
  ('7b0f0227-0613-475d-838c-917984707163'::uuid),
  ('7b325e39-4edd-4aa5-b637-3c9e599d6027'::uuid),
  ('7d291605-8858-42f1-b27f-a4080cee1850'::uuid),
  ('8169d93c-5aad-4ab7-8dc2-7c9b697b761b'::uuid),
  ('82dcdb86-b0ea-40a3-a4a8-79c388a816af'::uuid),
  ('859b1285-027f-49ed-bdd5-88b6b71c8765'::uuid),
  ('85df9769-84e3-45a9-b0f8-d55b43a58d4f'::uuid),
  ('880e789e-d13c-4ef8-ae1f-6be1c8f10752'::uuid),
  ('8e82fa7b-3467-45dd-98ed-6b5494154014'::uuid),
  ('9452788c-94c5-4985-9dca-f2d20e2e0712'::uuid),
  ('9774e058-df5a-480f-a230-2f37d521beae'::uuid),
  ('97c9b75f-6a19-436e-8dc5-41585b30183a'::uuid),
  ('9934a145-5fa3-4c59-9828-6a2f50667d26'::uuid),
  ('9b317b1f-6a79-4756-b656-c178e1c2db76'::uuid),
  ('9bb2681a-0906-452e-8dcf-e0a8d9d8cdb1'::uuid),
  ('9dab9d43-d9bb-4a54-88c8-8cfccff880a5'::uuid),
  ('a15d7795-9ebf-49d2-be86-3b331a0bd13d'::uuid),
  ('a266c761-6afb-419f-9ed5-54125d7d1757'::uuid),
  ('a35a042c-e4a9-406b-a9dd-3ee28cf958e9'::uuid),
  ('a7880999-374d-46a4-a862-df1c6ab6cde9'::uuid),
  ('aa598054-1ba7-4b7f-8eb2-a31ad03c110a'::uuid),
  ('adaf65c8-8438-424f-bd9b-7538ddbe4a4d'::uuid),
  ('ae70e381-cc4f-4814-971c-fe4c01cb4d9f'::uuid),
  ('aeb4a056-0e22-4192-ab82-d70a555e228f'::uuid),
  ('af0b1dc2-98a5-4f9f-9b6e-b01cfae8982e'::uuid),
  ('afdc5121-254e-40fd-a66e-a14d23d967f4'::uuid),
  ('b0741d32-3a29-4749-b778-8adaf1405b84'::uuid),
  ('b1892728-41ce-46a4-9d4d-abf87f1a51ec'::uuid),
  ('b2c4fb4e-66c0-4847-96ed-c63d4468210e'::uuid),
  ('b35116b5-5936-483e-9186-00eaba549e13'::uuid),
  ('b3ec6d62-b70e-4090-9284-cb715a3f2d0f'::uuid),
  ('b9dd188a-ebae-4c29-baac-d26cab433edd'::uuid),
  ('b9ddecfe-7ef3-48f7-8aa5-c1b3eed1d680'::uuid),
  ('ba9a5f3e-0cbc-49b1-91f5-613d54f3ac05'::uuid),
  ('bdd18204-11d1-41f0-8508-e378882ad73a'::uuid),
  ('c26a6420-94de-4f16-8687-3a1448583c90'::uuid),
  ('c2fd8a94-465c-4d93-8f96-fe7320210e49'::uuid),
  ('c3e1d0e4-2f6e-460f-804b-62e4530c13d1'::uuid),
  ('c533334c-7476-466f-9af3-e7f5b1e0cbb8'::uuid),
  ('c5a66db0-4a63-4909-8365-4db27a51855d'::uuid),
  ('c60d74cf-419d-471a-93b6-651ed85d0330'::uuid),
  ('ca2bb6d9-a90f-403a-a4e6-0baaf553345b'::uuid),
  ('ce6f03aa-a148-49f0-8b1a-774259b4c32d'::uuid),
  ('d0c0814f-4abb-49d1-babc-5942727ec8e2'::uuid),
  ('d19ad20e-123c-4fcf-b747-ae4622a07bef'::uuid),
  ('d2adc94a-c874-41d4-b281-9a7cffbcd130'::uuid),
  ('d3f37281-83af-4553-81d2-07d6c76f2b31'::uuid),
  ('d6719fde-2f27-4223-9056-1f6c933cd1e3'::uuid),
  ('d695dc8b-aae9-467a-99b9-a712cdbfdf95'::uuid),
  ('d6b05837-6999-41c6-8a95-5e0e0675772a'::uuid),
  ('d7cddf92-499c-4e2b-84bd-30d545409862'::uuid),
  ('d8147d9d-cba8-4bfb-9d7a-330547356474'::uuid),
  ('de38d3f5-ad3e-4331-8789-8a51880eebad'::uuid),
  ('e18ad683-0d93-441a-9c62-e74ab861cbe3'::uuid),
  ('e2aa04d8-84c5-4abe-a709-3e2cfab4a7ce'::uuid),
  ('e3846f2c-141a-48f2-ab97-d582d212aab4'::uuid),
  ('e39af150-848e-46a9-985c-e742c301b724'::uuid),
  ('e70f76d6-3e7d-4591-a628-714be83162d3'::uuid),
  ('e8a7ab16-42fc-4e4c-a55e-0a98d76062f0'::uuid),
  ('e90bd5a0-abdc-433a-87ca-af2e3509be03'::uuid),
  ('e92d99d3-2538-4e41-8fc7-d101cfb744ac'::uuid),
  ('ed1f9593-a62b-4f30-a467-673cd1b2887d'::uuid),
  ('ee3c3be4-fdb8-4678-a2a7-a8cdc89e8031'::uuid),
  ('ef2b69d3-d7fa-485b-989c-b054c0dccae2'::uuid),
  ('f0c424b2-0c18-4559-9073-60e61a6a5fad'::uuid),
  ('f195f04d-dae9-4be4-a689-f6c4987b878f'::uuid),
  ('f1980058-a957-40b5-bc96-8becb9a7615d'::uuid),
  ('f2cbb4f7-fdfd-4f69-9063-6b0546abe2fe'::uuid),
  ('f30164d8-dcf5-4323-a841-bea2f39616e2'::uuid),
  ('f670edfb-6c75-4add-9963-ed9b290da912'::uuid),
  ('f85ac2dd-4af0-48a0-8afa-d9c3ec2bbf65'::uuid),
  ('f9be9d28-2ecc-4362-8056-67d91cca493f'::uuid),
  ('faa7925e-468b-464d-b739-d5a9fdccc2bf'::uuid),
  ('fbe281a5-1a96-473f-87f7-650101980d11'::uuid),
  ('fd88be0d-db00-4a28-ad0f-000b099d16a4'::uuid),
  ('fe18bc9f-2238-48bb-8099-91a6f418621f'::uuid),
  ('fef913cf-1e56-42d0-aa37-9bab1d6e29e9'::uuid)
),
neuporabljeni as (
  select a.id
  from kandidati k
  join public.articles a on a.id = k.id
  where a.viden_app = true
    and not exists (
      select 1
      from public.delivery_note_items i
      join public.delivery_notes n on n.id = i.note_id
      where n.org_id = a.org_id
        and ( i.article_id = a.id
           or (i.article_id is null
               and lower(btrim(i.article_name)) = lower(btrim(a.name))) )
    )
),
kopija as (
  insert into app.viden_app_kopija (article_id, razlog)
  select id, 'množično dodan, neuporabljen (pregled 21. 10. 2026)' from neuporabljeni
  on conflict (article_id) do nothing
  returning article_id
)
update public.articles
set viden_app = false
where id in (select article_id from kopija);
