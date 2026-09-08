// ---------------------------------------------------------------------------
//  NM BAU TÖRZSÁRLISTA - the real, itemised trade price list.
//
//  GENERATED from AJÁNLAT.xlsx / "Törzsárlista" (the NM Bau master quoting
//  sheet). Do NOT hand-edit: re-export from the workbook instead, so the widget
//  and the sheet can never drift apart. Every rate here is a price NM Bau
//  actually quotes, sourced and dated per line in the workbook (Törő Péter /
//  Patakiné Varga Emília / Bazuba) - which is why the engine now assembles
//  quotes from these items instead of from invented per-m² averages.
//
//  TWO THINGS THAT DECIDE HOW THESE NUMBERS MAY BE USED - confirmed by NM Bau
//  on 2026-09-04:
//
//  1. LABOUR ONLY. "Csak munkadíj, a termék árát nem tartalmazza." The tiles,
//     the WC, the basin, the bath, the shower screen and the taps are NOT in
//     these prices - the customer buys those. Only the four "(anyagköltséggel)"
//     protection items carry their own material. Any quote built from this list
//     is a LABOUR quote and has to say so out loud.
//  2. NO VAT ON TOP. "ÁFA-mentes ár, tehát maximálisan fizetendő összeg
//     (alanyi adómentes)." NM Bau is alanyi adómentes, so a figure here is the
//     final amount payable - not a net price waiting for 27 percent VAT.
//
//  Currency: `huf` is the Hungarian price, `eur` the Austrian one. They are two
//  separately maintained market prices, NOT a conversion of one another - the
//  euro column sits around 268 Ft/EUR against a much higher market FX rate, so
//  the Austrian price is the dearer one in real money. Which column is used is
//  decided by the language the customer writes in, not by the location.
// ---------------------------------------------------------------------------

export const PRICE_LIST = {

    // --- BONTÁS ELŐKÉSZÍTÉSE ---
    "takarasi_munkak_utvonalvedelem_porvedo_ajto": { cat: "BONTÁS ELŐKÉSZÍTÉSE", huf: 25000, eur: 60, unit: "átalány", hu: "Takarási munkák – útvonalvédelem, porvédő ajtó, munkaterület védelem (anyagköltséggel) - S", de: "Abdeck- und Schutzarbeiten inkl. Laufwegschutz und Staubschutztür (inkl Material) - S" },
    "takarasi_munkak_utvonalvedelem_porvedo_ajto2": { cat: "BONTÁS ELŐKÉSZÍTÉSE", huf: 35000, eur: 75, unit: "átalány", hu: "Takarási munkák – útvonalvédelem, porvédő ajtó, munkaterület védelem (anyagköltséggel) - M", de: "Abdeck- und Schutzarbeiten inkl. Laufwegschutz und Staubschutztür (inkl Material)  - M" },
    "takarasi_munkak_utvonalvedelem_porvedo_ajto3": { cat: "BONTÁS ELŐKÉSZÍTÉSE", huf: 45000, eur: 98, unit: "átalány", hu: "Takarási munkák – útvonalvédelem, porvédő ajtó, munkaterület védelem, lépcső védelme (anyagköltséggel) - L", de: "Abdeck- und Schutzarbeiten inkl. Laufwegschutz und Staubschutztür (inkl Material)  - L" },
    "takarasi_munkak_utvonalvedelem_porvedo_ajto4": { cat: "BONTÁS ELŐKÉSZÍTÉSE", huf: 55000, eur: 155, unit: "átalány", hu: "Takarási munkák – útvonalvédelem, porvédő ajtó, munkaterület védelem (anyagköltséggel) - XL", de: "Abdeck- und Schutzarbeiten inkl. Laufwegschutz und Staubschutztür (inkl Material) - XL" },

    // --- BONTÁS ---
    "ablakparkany_bontasa": { cat: "BONTÁS", huf: 16000, eur: 60, unit: "db", hu: "Ablakpárkány bontása", de: "DEMONTAGE FENSTERBRETT" },
    "betontalapzat_eltavolitasa_a_zuhany_alatt_al": { cat: "BONTÁS", huf: 55000, eur: 210, unit: "átalány", hu: "Betontalapzat eltávolítása a zuhany alatt / aljzat előkészítése", de: "ENTFERNEN BETONSOCKEL UNTER DER DUSCHE / UNTERGRUND VORBEREITEN" },
    "bojler_bontasa_es_leuritese_elszallitassal": { cat: "BONTÁS", huf: 19000, eur: 70, unit: "db", hu: "Bojler bontása és leürítése (elszállítással)", de: "DEMONTAGE BOILER INKL. ENTLEEREN (entsorgen)" },
    "dekorburkolat_bontasa": { cat: "BONTÁS", huf: 30000, eur: 110, unit: "átalány", hu: "Dekorburkolat bontása", de: "Demontage der Dekorverkleidung" },
    "diszitocsempe_bordur_eltavolitasa_a_zuhanyzo": { cat: "BONTÁS", huf: 5000, eur: 20, unit: "átalány", hu: "Díszítőcsempe / bordűr eltávolítása a zuhanyzónál", de: "ENTFERNEN DER BORDÜRENFLIESEN IM DUSCHBEREICH" },
    "eloszobai_felso_szekreny_bontasa": { cat: "BONTÁS", huf: 15000, eur: 55, unit: "db", hu: "Előszobai felső szekrény bontása", de: "Demontage des Oberschranks im Vorraum" },
    "fali_wc_bontasa_elszallitassal": { cat: "BONTÁS", huf: 12000, eur: 40, unit: "db", hu: "Fali WC bontása (elszállítással)", de: "DEMONTAGE HÄNGE-WC (entsorgen)" },
    "fali_wc_bontasa_tovabbhasznalva": { cat: "BONTÁS", huf: 6000, eur: 23.5, unit: "db", hu: "Fali WC bontása (továbbhasználva)", de: "DEMONTAGE HÄNGE-WC (wird weiterverwendet)" },
    "falicsempe_bontasa_levesese": { cat: "BONTÁS", huf: 100000, eur: 371, unit: "átalány", hu: "Falicsempe bontása / levésése", de: "Abbruch / Entfernen der Wandfliesen" },
    "felsoszekreny_bontasa_elszallitassal": { cat: "BONTÁS", huf: 6000, eur: 23.5, unit: "db", hu: "Felsőszekrény bontása (elszállítással)", de: "DEMONTAGE OBERSCHRANK (entsorgen)" },
    "furdoszobai_kiegeszitok_bontasa_elszallitass": { cat: "BONTÁS", huf: 8000, eur: 30, unit: "db", hu: "Fürdőszobai kiegészítők bontása (elszállítással)", de: "DEMONTAGE ACCESSOIRES (entsorgen)" },
    "furdoszobai_kiegeszitok_bontasa_tovabbhaszna": { cat: "BONTÁS", huf: 8000, eur: 30, unit: "db", hu: "Fürdőszobai kiegészítők bontása (továbbhasználva)", de: "DEMONTAGE ACCESSOIRES (wird weiterverwendet)" },
    "gipszkarton_boritas_bontasa": { cat: "BONTÁS", huf: 6000, eur: 20, unit: "m²", hu: "Gipszkarton borítás bontása", de: "Demontage der Gipskartonverkleidung" },
    "hulladek_es_leszerelt_szaniterek_osszegyujte": { cat: "BONTÁS", huf: 15000, eur: 51, unit: "átalány", hu: "Hulladék és leszerelt szaniterek összegyűjtése, rakodása és elszállítása", de: "Sammeln, Verladen und fachgerechte Entsorgung von Bauschutt und demontierten Sanitärobjekten" },
    "jarolap_padlolap_bontasa": { cat: "BONTÁS", huf: 100000, eur: 371, unit: "átalány", hu: "Járólap / padlólap bontása", de: "Abbruch / Entfernen der Bodenfliesen" },
    "kazan_keszulek_bontasa_tovabbhasznalva": { cat: "BONTÁS", huf: 13000, eur: 46.5, unit: "db", hu: "Kazán / készülék bontása (továbbhasználva)", de: "DEMONTAGE THERME (wird weiterverwendet)" },
    "kiegeszito_furdoszobabutor_bontasa_elszallit": { cat: "BONTÁS", huf: 8000, eur: 30, unit: "db", hu: "Kiegészítő fürdőszobabútor bontása (elszállítással)", de: "DEMONTAGE BEIMÖBEL (entsorgen)" },
    "konyhabutor_bontasa_felso_es_also_elemek_mun": { cat: "BONTÁS", huf: 90000, eur: 330, unit: "átalány", hu: "Konyhabútor bontása – felső és alsó elemek, munkalap", de: "Demontage der Küchenmöbel inkl. Ober- und Unterschränke sowie Arbeitsplatte" },
    "kad_bontasa_es_zuhanytalca_beepitese": { cat: "BONTÁS", huf: 255000, eur: 950, unit: "átalány", hu: "Kád bontása és zuhanytálca beépítése", de: "Badewanne entfernen und Duschtasse einbauen" },
    "kad_bontasa_elszallitassal": { cat: "BONTÁS", huf: 45000, eur: 170, unit: "db", hu: "Kád bontása (elszállítással)", de: "Badewanne entfernen (entsorgen)" },
    "kad_csaptelep_bontasa_elszallitassal": { cat: "BONTÁS", huf: 8000, eur: 30, unit: "db", hu: "Kád csaptelep bontása (elszállítással)", de: "DEMONTAGE ARMATUR – BADEWANNE (entsorgen)" },
    "kad_csaptelep_bontasa_tovabbhasznalva": { cat: "BONTÁS", huf: 8000, eur: 30, unit: "db", hu: "Kád csaptelep bontása (továbbhasználva)", de: "DEMONTAGE ARMATUR – BADEWANNE (wird weiterverwendet)" },
    "kad_elotetfal_ytong_talapzat_bontasa": { cat: "BONTÁS", huf: 13000, eur: 50, unit: "db", hu: "Kád előtétfal / Ytong talapzat bontása", de: "ABBRUCH BADEWANNENSOCKEL / YTONG-SOCKEL" },
    "kadparavan_bontasa_elszallitassal": { cat: "BONTÁS", huf: 10000, eur: 37.5, unit: "db", hu: "Kádparaván bontása (elszállítással)", de: "DEMONTAGE BADEWANNENAUFSATZ (entsorgen)" },
    "lamberia_falburkolat_bontasa": { cat: "BONTÁS", huf: 55000, eur: 200, unit: "átalány", hu: "Lambéria / falburkolat bontása", de: "Demontage der Wand- bzw. Holzverkleidung" },
    "magasszekreny_bontasa_elszallitassal": { cat: "BONTÁS", huf: 6000, eur: 23.5, unit: "db", hu: "Magasszekrény bontása (elszállítással)", de: "DEMONTAGE HOCHSCHRANK (entsorgen)" },
    "meglevo_kad_bontasa_eltavolitasa_es_csatlako": { cat: "BONTÁS", huf: 60000, eur: 232, unit: "átalány", hu: "Meglévő kád bontása / eltávolítása és csatlakozások lezárása", de: "Badewanne entfernen und Anschlüsse stilllegen" },
    "meglevo_szaniterek_elbontasa": { cat: "BONTÁS", huf: 20000, eur: 75, unit: "db", hu: "Meglévő szaniterek elbontása", de: "Demontage der bestehenden Sanitärobjekte" },
    "meglevo_zuhanyzo_bontasa_eltavolitasa_es_csa": { cat: "BONTÁS", huf: 50000, eur: 185.5, unit: "átalány", hu: "Meglévő zuhanyzó bontása / eltávolítása és csatlakozások lezárása", de: "Dusche entfernen und Anschlüsse stilllegen" },
    "mosdo_bontasa_elszallitassal": { cat: "BONTÁS", huf: 6000, eur: 23.5, unit: "db", hu: "Mosdó bontása (elszállítással)", de: "DEMONTAGE WASCHBECKEN (entsorgen)" },
    "mosdo_es_alsoszekreny_bontasa_elszallitassal": { cat: "BONTÁS", huf: 12000, eur: 45, unit: "db", hu: "Mosdó és alsószekrény bontása (elszállítással)", de: "DEMONTAGE WASCHBECKEN / WASCHTISCHBECKEN MIT UNTERSCHRANK (entsorgen)" },
    "mosdo_es_csaptelep_bontasa_tovabbhasznalva": { cat: "BONTÁS", huf: 8000, eur: 30, unit: "db", hu: "Mosdó és csaptelep bontása (továbbhasználva)", de: "DEMONTAGE WASCHBECKEN INKL. ARMATUR (wird weiterverwendet)" },
    "mosogep_lekotese_es_felreallitasa": { cat: "BONTÁS", huf: 8000, eur: 30, unit: "db", hu: "Mosógép lekötése és félreállítása", de: "DEMONTAGE WASCHMASCHINE (wird weiterverwendet)" },
    "pengefal_elbontasa": { cat: "BONTÁS", huf: 45000, eur: 170, unit: "átalány", hu: "Pengefal elbontása", de: "Abbruch einer Trennwand" },
    "radiator_bontasa_elszallitassal": { cat: "BONTÁS", huf: 8000, eur: 30, unit: "db", hu: "Radiátor bontása (elszállítással)", de: "DEMONTAGE HEIZKÖRPER (entsorgen)" },
    "radiator_bontasa_tovabbhasznalva": { cat: "BONTÁS", huf: 9000, eur: 35, unit: "db", hu: "Radiátor bontása (továbbhasználva)", de: "DEMONTAGE HEIZKÖRPER (wird weiterverwendet)" },
    "szaritogep_lekotese_es_felreallitasa": { cat: "BONTÁS", huf: 8000, eur: 30, unit: "db", hu: "Szárítógép lekötése és félreállítása", de: "DEMONTAGE TROCKNER (wird weiterverwendet)" },
    "tukros_szekreny_bontasa_tovabbhasznalva": { cat: "BONTÁS", huf: 6000, eur: 23.5, unit: "db", hu: "Tükrös szekrény bontása (továbbhasználva)", de: "DEMONTAGE SPIEGELSCHRANK (wird weiterverwendet)" },
    "tukor_bontasa_elszallitassal": { cat: "BONTÁS", huf: 6000, eur: 23.5, unit: "db", hu: "Tükör bontása (elszállítással)", de: "DEMONTAGE SPIEGEL (entsorgen)" },
    "wc_bontasa_tovabbhasznalva": { cat: "BONTÁS", huf: 8000, eur: 30, unit: "db", hu: "WC bontása (továbbhasználva)", de: "DEMONTAGE WC (wird weiterverwendet)" },
    "zuhany_belepo_ytong_talapzat_bontasa": { cat: "BONTÁS", huf: 13000, eur: 50, unit: "db", hu: "Zuhany belépő Ytong talapzat bontása", de: "ABBRUCH DUSCH-EINSTIEGSSOCKEL / YTONG-SOCKEL" },
    "zuhany_bontasa_es_uj_zuhanytalca_beepitese": { cat: "BONTÁS", huf: 255000, eur: 950, unit: "átalány", hu: "Zuhany bontása és új zuhanytálca beépítése", de: "Bestehende Dusche entfernen und neue Duschtasse einbauen" },
    "zuhany_csaptelep_bontasa_tovabbhasznalva": { cat: "BONTÁS", huf: 8000, eur: 30, unit: "db", hu: "Zuhany csaptelep bontása (továbbhasználva)", de: "DEMONTAGE ARMATUR – DUSCHE (wird weiterverwendet)" },
    "zuhanycsaptelep_zuhanyszett_bontasa_elszalli": { cat: "BONTÁS", huf: 8000, eur: 30, unit: "db", hu: "Zuhanycsaptelep / zuhanyszett bontása (elszállítással)", de: "DEMONTAGE ARMATUR / BRAUSE-SET – DUSCHE (entsorgen)" },
    "zuhanyfal_bontasa_elszallitassal": { cat: "BONTÁS", huf: 10000, eur: 37.5, unit: "db", hu: "Zuhanyfal bontása (elszállítással)", de: "DEMONTAGE DUSCHTRENNWAND (entsorgen)" },
    "zuhanyterulet_kibontasa_100100_cm_felett": { cat: "BONTÁS", huf: 75000, eur: 280, unit: "átalány", hu: "Zuhanyterület kibontása 100×100 cm felett", de: "FREISTEMMEN DES DUSCHBEREICHS GRÖSSER ALS 100×100 CM" },
    "zuhanyterulet_kibontasa_100100_cm_ig": { cat: "BONTÁS", huf: 55000, eur: 210, unit: "átalány", hu: "Zuhanyterület kibontása 100×100 cm-ig", de: "FREISTEMMEN DES DUSCHBEREICHS BIS 100×100 CM" },
    "wc_bontasa_elszallitassal": { cat: "BONTÁS", huf: 9000, eur: 35, unit: "db", hu: "WC bontása (elszállítással)", de: "DEMONTAGE WC (entsorgen)" },

    // --- VÍZ- ÉS CSATORNASZERELÉS ---
    "camargue_szanitermodul_viz_es_csatornakialla": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 90000, eur: 330, unit: "db", hu: "Camargue szanitermodul víz- és csatornakiállás átalakítása", de: "Anpassung der Wasser- und Abwasseranschlüsse für ein Camargue-Sanitärmodul" },
    "dn32_csepegtetocso_kialakitasa": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 45000, eur: 170, unit: "átalány", hu: "DN32 csepegtetőcső kialakítása", de: "Herstellung einer DN32-Tropfwasser- bzw. Ablaufleitung" },
    "egymedences_mosdo_dupla_mosdo_vizvezetek_ath": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 120000, eur: 450, unit: "átalány", hu: "Egymedencés mosdó → dupla mosdó: vízvezeték áthelyezése", de: "WASCHBECKEN ZU DOPPELWASCHBECKEN – WASSERLEITUNG VERSETZEN" },
    "elektromos_vizmelegito_vizkiallas_kialakitas": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 90000, eur: 330, unit: "db", hu: "Elektromos vízmelegítő vízkiállás kialakítása", de: "Herstellung der Wasseranschlüsse für einen Elektro-Warmwasserspeicher" },
    "falba_epitett_csaptelep_atalakitasa_falon_ki": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 60000, eur: 232, unit: "átalány", hu: "Falba épített csaptelep átalakítása falon kívülire", de: "Umbau einer Unterputzarmatur auf Aufputzarmatur" },
    "hideg_es_melegviz_kiallas_kialakitasa_kadcsa": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 85000, eur: 320, unit: "átalány", hu: "Hideg- és melegvíz-kiállás kialakítása kádcsaptelep részére", de: "Herstellung der Kalt- und Warmwasseranschlüsse für die Badewannenarmatur" },
    "hideg_es_melegviz_kiallas_kialakitasa_zuhany": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 85000, eur: 320, unit: "átalány", hu: "Hideg- és melegvíz-kiállás kialakítása zuhanycsaptelep részére", de: "Herstellung der Kalt- und Warmwasseranschlüsse für die Duscharmatur" },
    "hidegvizes_elzaro_megszuntetese": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 30000, eur: 110, unit: "db", hu: "Hidegvizes elzáró megszüntetése", de: "Stilllegung bzw. Entfernung eines Kaltwasser-Absperrventils" },
    "hidegviz_csatlakozas_kialakitasa_monoblokkos": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 35000, eur: 130, unit: "db", hu: "Hidegvíz-csatlakozás kialakítása monoblokkos / tartályos WC-hez", de: "Herstellung des Kaltwasseranschlusses für ein Monoblock- bzw. Spülkasten-WC" },
    "keramia_wc_ki_es_beszerelese": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 45000, eur: 165, unit: "db", hu: "Kerámia WC ki- és beszerelése", de: "Aus- und Wiedereinbau des WC-Beckens" },
    "kondenzviz_elvezetes_kialakitasa_es_bekotese": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 35000, eur: 130, unit: "átalány", hu: "Kondenzvíz-elvezetés kialakítása és bekötése", de: "Herstellung und Anschluss einer Kondensatablaufleitung" },
    "konyha_oldali_viz_csatorna_visszakotes": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 45000, eur: 170, unit: "átalány", hu: "Konyha oldali víz/csatorna visszakötés", de: "Wiederanschluss der Wasser- und Abwasserleitungen auf Küchenseite" },
    "kad_beepitese_es_bekotese": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 85000, eur: 320, unit: "db", hu: "Kád beépítése és bekötése", de: "Einbau und Anschluss der Badewanne" },
    "kad_zuhany_vizvezetek_athelyezese_megtoldasa": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 150000, eur: 550, unit: "átalány", hu: "Kád → zuhany: vízvezeték áthelyezése / megtoldása", de: "BADEWANNE ZU DUSCHE – WASSERLEITUNG VERSETZEN / ANSTÜCKELN" },
    "monoblokkos_tartalyos_wc_alapszerelese_hideg": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 110000, eur: 165, unit: "db", hu: "Monoblokkos / tartályos WC alapszerelése (hidegvíz + csatorna)", de: "Montage und Anschluss eines Monoblock- bzw. Spülkasten-WCs" },
    "mosdo_hideg_melegviz_es_csatornakiallas_kial": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 105000, eur: 390, unit: "átalány", hu: "Mosdó hideg-, melegvíz- és csatornakiállás kialakítása / áthelyezése", de: "Herstellung bzw. Versetzen der Kalt-/Warmwasser- und Abwasseranschlüsse für den Waschtisch" },
    "mosdo_viz_es_lefolyocsatlakozas_lezarasa": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 25000, eur: 93, unit: "átalány", hu: "Mosdó víz- és lefolyócsatlakozás lezárása", de: "STILLLEGEN EINES WASCHBECKENS" },
    "mosogato_es_mosogatogep_viz_es_csatornakiall": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 105000, eur: 390, unit: "átalány", hu: "Mosogató és mosogatógép víz- és csatornakiállás kialakítása", de: "Herstellung der Wasser- und Abwasseranschlüsse für Spüle und Geschirrspüler" },
    "mosogep_hidegviz_es_csatornakiallas_kialakit": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 60000, eur: 232, unit: "átalány", hu: "Mosógép hidegvíz- és csatornakiállás kialakítása / áthelyezése", de: "Herstellung bzw. Versetzen der Kaltwasser- und Abwasseranschlüsse für die Waschmaschine" },
    "pince_oldali_viz_csatorna_visszakotes": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 45000, eur: 170, unit: "átalány", hu: "Pince oldali víz/csatorna visszakötés", de: "Wiederanschluss der Wasser- und Abwasserleitungen auf Kellerseite" },
    "sarokkad_beepitese": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 110000, eur: 410, unit: "db", hu: "Sarokkád beépítése", de: "Einbau und Anschluss einer Eckbadewanne" },
    "szabadonallo_kad_viz_es_csatornakiallas_kial": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 120000, eur: 450, unit: "átalány", hu: "Szabadonálló kád víz- és csatornakiállás kialakítása", de: "Herstellung der Wasser- und Abwasseranschlüsse für eine freistehende Badewanne" },
    "wc_kiallas_atalakitasa_monoblokkos_wc_reszer": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 80000, eur: 295, unit: "db", hu: "WC-kiállás átalakítása monoblokkos WC részére", de: "Versetzen des WC-Anschlusses für ein Monoblock-WC" },
    "wc_allvany_beepitese_es_bekotese": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 110000, eur: 410, unit: "db", hu: "WC-állvány beépítése és bekötése", de: "Einbau und Anschluss eines WC-Vorwandelements" },
    "wc_allvany_csereje_meglevo_helyen": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 130000, eur: 480, unit: "db", hu: "WC-állvány cseréje meglévő helyen", de: "Austausch des WC-Vorwandelements am bestehenden Standort" },
    "zuhany_csatlakozasainak_lezarasa": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 30000, eur: 103, unit: "átalány", hu: "Zuhany csatlakozásainak lezárása", de: "STILLLEGEN DER DUSCH-ANSCHLÜSSE" },
    "zuhanyfolyoka_beallitasa_es_bekotese_epitett": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 85000, eur: 320, unit: "db", hu: "Zuhanyfolyóka beállítása és bekötése épített zuhanyzóhoz", de: "Einbau und Anschluss einer Duschrinne für eine bodengleiche Dusche" },
    "zuhanytalca_beepitese_es_bekotese": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 230000, eur: 850, unit: "db", hu: "Zuhanytálca beépítése és bekötése", de: "Einbau und Anschluss der Duschtasse" },
    "zuhanytalca_meretre_vagasa": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 22000, eur: 82.5, unit: "db", hu: "Zuhanytálca méretre vágása", de: "Zuschneiden und Einpassen der Duschtasse" },
    "hideg_es_melegviz_kiallas_atalakitasa_elektr": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 50000, eur: null, unit: "db", hu: "Hideg és melegvíz kiállás átalakítása elektromos vízmelegítő részére", de: "" },
    "monoblokkos_tartalyos_wc_beepitese": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 45000, eur: 165, unit: "db", hu: "Monoblokkos / tartályos WC beépítése", de: "Montage und Anschluss eines Monoblock- bzw. Spülkasten-WCs" },
    "wc_kiallas_athelyezese_monoblokkos_wc_reszer": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 80000, eur: 295, unit: "db", hu: "WC-kiállás áthelyezése monoblokkos WC részére", de: "Versetzen des WC-Anschlusses für ein Monoblock-WC" },
    "zuhanytalca_meretre_vagasa_beillesztese": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 22000, eur: 82.5, unit: "db", hu: "Zuhanytálca méretre vágása / beillesztése", de: "Zuschneiden und Einpassen der Duschtasse" },
    "alapszereles_bide_reszere": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 90000, eur: 380, unit: "átalány", hu: "Alapszerelés Bidé részére", de: "Grundinstallation der Wasser- und Abwasserleitungen für ein Bidet" },
    "gazkazan_emeletre_futo_csovek_kazan_ala_atsz": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 80000, eur: 295, unit: "átalány", hu: "Gázkazán- emeletre futó csövek kazán alá átszerelése", de: "" },
    "hidegvizvezetek_kiepitese_kave_vagy_uditogep": { cat: "VÍZ- ÉS CSATORNASZERELÉS", huf: 85000, eur: 320, unit: "átalány", hu: "Hidegvízvezeték kiépítése kávé- vagy üdítőgép részére.", de: "Herstellung einer Kaltwasserleitung für eine Kaffee- oder Getränkemaschine" },

    // --- FŰTÉSSZERELÉS ---
    "elektromos_futokabel_fektetese_jarolap_ala": { cat: "FŰTÉSSZERELÉS", huf: 4000, eur: 15, unit: "m²", hu: "Elektromos fűtőkábel fektetése járólap alá", de: "Verlegung eines elektrischen Heizkabels unter den Bodenfliesen" },
    "futescsovek_athelyezese_falba_sullyesztese_1": { cat: "FŰTÉSSZERELÉS", huf: 110000, eur: 400, unit: "átalány", hu: "Fűtéscsövek áthelyezése / falba süllyesztése 1 m-ig", de: "VERSETZEN VON HEIZUNGSROHREN 1 M" },
    "futescsovek_athelyezese_3_m_ig_kozepcsatlako": { cat: "FŰTÉSSZERELÉS", huf: 110000, eur: 400, unit: "átalány", hu: "Fűtéscsövek áthelyezése 3 m-ig + középcsatlakozás", de: "VERSETZEN VON HEIZUNGSROHREN BIS 3 M PLUS ANPASSEN AUF MITTELANSCHLUSS" },
    "futesi_rendszer_uritese_feltoltese_es_legtel": { cat: "FŰTÉSSZERELÉS", huf: 45000, eur: 170, unit: "átalány", hu: "Fűtési rendszer ürítése, feltöltése és légtelenítése", de: "Entleeren, Befüllen und Entlüften der Heizungsanlage" },
    "meglevo_kazan_keszulek_visszaszerelese_megle": { cat: "FŰTÉSSZERELÉS", huf: 81000, eur: 300, unit: "db", hu: "Meglévő kazán / készülék visszaszerelése meglévő csatlakozásra", de: "MONTAGE EINER THERME (ALTBESTAND) AUF BESTEHENDEM ANSCHLUSS" },
    "radiator_felszerelese": { cat: "FŰTÉSSZERELÉS", huf: 46000, eur: 170, unit: "db", hu: "Radiátor felszerelése", de: "Montage eines Heizkörpers" },
    "torolkozoszarito_radiator_felszerelese": { cat: "FŰTÉSSZERELÉS", huf: 46000, eur: 170, unit: "db", hu: "Törölközőszárító radiátor felszerelése", de: "Montage eines Handtuchheizkörpers" },
    "radiator_csereje": { cat: "FŰTÉSSZERELÉS", huf: 62000, eur: 230, unit: "db", hu: "Radiátor cseréje", de: "Austausch des Heizkörpers" },
    "radiatorcsatlakozas_lezarasa": { cat: "FŰTÉSSZERELÉS", huf: 25000, eur: 93, unit: "átalány", hu: "Radiátorcsatlakozás lezárása", de: "STILLLEGEN EINES HEIZKÖRPERS" },
    "torolkozoszarito_radiator_alapszereles": { cat: "FŰTÉSSZERELÉS", huf: 75000, eur: 280, unit: "db", hu: "Törölközőszárító radiátor alapszerelés", de: "Anschlussvorbereitung für einen Handtuchheizkörper" },

    // --- LÉGTECHNIKA ---
    "dn100_fali_elszivo_ventilator_kialakitasa": { cat: "LÉGTECHNIKA", huf: 45000, eur: 165, unit: "db", hu: "DN100 fali elszívó ventilátor kialakítása", de: "Herstellung eines DN100-Wandanschlusses für einen Abluftventilator" },
    "komplett_elszivo_rendszer_3_wc_1_zuhanyhelyi": { cat: "LÉGTECHNIKA", huf: 660000, eur: 2450, unit: "átalány", hu: "Komplett elszívó rendszer 3 WC + 1 zuhanyhelyiség részére", de: "Komplette Abluftanlage für 3 WCs und 1 Duschraum" },
    "ventilator_csereje": { cat: "LÉGTECHNIKA", huf: 100000, eur: 371, unit: "db", hu: "Ventilátor cseréje", de: "AUSTAUSCH DES VENTILATORS" },

    // --- ELŐKÉSZÍTÉS / KŐMŰVES MUNKÁK ---
    "70_cm_es_belteri_ajto_beepitese": { cat: "ELŐKÉSZÍTÉS / KŐMŰVES MUNKÁK", huf: 70000, eur: 260, unit: "db", hu: "70 cm-es beltéri ajtó beépítése", de: "Einbau einer 70-cm-Innentür" },
    "ablakkava_kialakitasa": { cat: "ELŐKÉSZÍTÉS / KŐMŰVES MUNKÁK", huf: 55000, eur: 205, unit: "db", hu: "Ablakkáva kialakítása", de: "Herstellung bzw. Ausarbeitung der Fensterlaibung" },
    "akril_kad_elotetfal_falazasa_ytongbol": { cat: "ELŐKÉSZÍTÉS / KŐMŰVES MUNKÁK", huf: 65000, eur: 240, unit: "db", hu: "Akril kád előtétfal falazása Ytongból", de: "Herstellung der Badewannenverkleidung aus Ytong" },
    "aljzat_felcsiszolasa": { cat: "ELŐKÉSZÍTÉS / KŐMŰVES MUNKÁK", huf: 4000, eur: 15, unit: "m²", hu: "Aljzat felcsiszolása", de: "Schleifen des Estrichs" },
    "aljzatbeton_javitasa": { cat: "ELŐKÉSZÍTÉS / KŐMŰVES MUNKÁK", huf: 4000, eur: 15, unit: "m²", hu: "Aljzatbeton javítása", de: "Ausbesserung des Estrichs" },
    "aljzatbeton_onterulo_aljzatkiegyenlitese": { cat: "ELŐKÉSZÍTÉS / KŐMŰVES MUNKÁK", huf: 6000, eur: 20, unit: "m²", hu: "Aljzatbeton önterülő aljzatkiegyenlítése", de: "Nivellierung des Estrichs mit selbstverlaufender Ausgleichsmasse" },
    "esztrich_potlasa_kis_teruleten_0_5_m2_ig": { cat: "ELŐKÉSZÍTÉS / KŐMŰVES MUNKÁK", huf: 30000, eur: 115, unit: "átalány", hu: "Esztrich pótlása kis területen, 0,5 m²-ig", de: "Ergänzung des Estrichs auf Kleinflächen bis 0,5 m²" },
    "esztrich_potlasa_kad_sarokkad_helyen": { cat: "ELŐKÉSZÍTÉS / KŐMŰVES MUNKÁK", huf: 75000, eur: 270, unit: "átalány", hu: "Esztrich pótlása kád / sarokkád helyén", de: "Ergänzung des Estrichs im Bereich der Badewanne / Eckbadewanne" },
    "falfeluletek_epitolemezes_kiegyenlitese": { cat: "ELŐKÉSZÍTÉS / KŐMŰVES MUNKÁK", huf: 8000, eur: 30, unit: "m²", hu: "Falfelületek építőlemezes kiegyenlítése", de: "Ausgleich der Wandflächen mit Bauplatten" },
    "falfeluletek_es_aljzatbeton_melyalapozasa": { cat: "ELŐKÉSZÍTÉS / KŐMŰVES MUNKÁK", huf: 1000, eur: 5, unit: "m²", hu: "Falfelületek és aljzatbeton mélyalapozása", de: "Grundierung der Wandflächen und des Estrichs" },
    "falhornyok_visszajavitasa": { cat: "ELŐKÉSZÍTÉS / KŐMŰVES MUNKÁK", huf: 45000, eur: 170, unit: "átalány", hu: "Falhornyok visszajavítása", de: "Schließen und Ausbessern der Installationsschlitze" },
    "fogado_falfelulet_kvarchomokos_tapadohid_kez": { cat: "ELŐKÉSZÍTÉS / KŐMŰVES MUNKÁK", huf: 4000, eur: 15, unit: "m²", hu: "Fogadó falfelület kvarchomokos tapadóhíd kezelése", de: "Auftragen einer quarzsandhaltigen Haftbrücke auf die Wandflächen" },
    "fogado_falfeluletek_kezi_simitovakolasa": { cat: "ELŐKÉSZÍTÉS / KŐMŰVES MUNKÁK", huf: 6000, eur: 20, unit: "m²", hu: "Fogadó falfelületek kézi simítóvakolása", de: "Handglättputz der Wandflächen" },
    "gipszkarton_felulet_helyreallitasa": { cat: "ELŐKÉSZÍTÉS / KŐMŰVES MUNKÁK", huf: 8000, eur: 30, unit: "m²", hu: "Gipszkarton felület helyreállítása", de: "Wiederherstellung der Gipskartonfläche" },
    "kenheto_vizszigeteles_kialakitasa_a_zuhanyte": { cat: "ELŐKÉSZÍTÉS / KŐMŰVES MUNKÁK", huf: 4000, eur: 15, unit: "m²", hu: "Kenhető vízszigetelés kialakítása a zuhanytérben", de: "Herstellung einer Flüssigabdichtung im Duschbereich" },
    "kad_feletti_ytong_polcszerkezet_kialakitasa": { cat: "ELŐKÉSZÍTÉS / KŐMŰVES MUNKÁK", huf: 85000, eur: 320, unit: "db", hu: "Kád feletti Ytong polcszerkezet kialakítása és vízszigetelése", de: "Herstellung und Abdichtung einer Ytong-Ablage über der Badewanne" },
    "kadperem_vizszigetelese": { cat: "ELŐKÉSZÍTÉS / KŐMŰVES MUNKÁK", huf: 20000, eur: 70, unit: "átalány", hu: "Kádperem vízszigetelése", de: "Abdichtung des Badewannenrandes" },
    "melyitett_polc_niche_kialakitasa_a_zuhanyter": { cat: "ELŐKÉSZÍTÉS / KŐMŰVES MUNKÁK", huf: 90000, eur: 330, unit: "db", hu: "Mélyített polc / niche kialakítása a zuhanytérben", de: "Herstellung einer Wandnische / Duschablage im Duschbereich" },
    "parapetfal_epitese_a_zuhanyzoban": { cat: "ELŐKÉSZÍTÉS / KŐMŰVES MUNKÁK", huf: 90000, eur: 330, unit: "átalány", hu: "Parapetfal építése a zuhanyzóban", de: "Errichtung einer Brüstungs- bzw. Trennwand im Duschbereich" },
    "wc_allvany_dobozolasa_impregnalt_gipszkarton": { cat: "ELŐKÉSZÍTÉS / KŐMŰVES MUNKÁK", huf: 55000, eur: 205, unit: "db", hu: "WC-állvány dobozolása impregnált gipszkartonnal", de: "Verkleidung des WC-Vorwandelements mit imprägnierten Gipskartonplatten" },
    "ytong_emeles_kialakitasa_zuhanytalca_alatt": { cat: "ELŐKÉSZÍTÉS / KŐMŰVES MUNKÁK", huf: 45000, eur: 170, unit: "átalány", hu: "Ytong emelés kialakítása zuhanytálca alatt", de: "Herstellung einer Ytong-Aufmauerung unter der Duschtasse" },
    "aljzatbeton_szintezese": { cat: "ELŐKÉSZÍTÉS / KŐMŰVES MUNKÁK", huf: 30000, eur: 100, unit: "m²", hu: "Aljzatbeton szintezése", de: "" },
    "ytong_falazat_epitese_csovezetekek_takarasah": { cat: "ELŐKÉSZÍTÉS / KŐMŰVES MUNKÁK", huf: 65000, eur: 240, unit: "átalány", hu: "Ytong falazat építése csővezetékek takarásához", de: "Herstellung einer Ytong-Verkleidung zur Rohrabdeckung" },
    "zuhanytalca_perem_vizszigetelese": { cat: "ELŐKÉSZÍTÉS / KŐMŰVES MUNKÁK", huf: 20000, eur: 75, unit: "db", hu: "Zuhanytálca perem vízszigetelése", de: "Abdichtung des Duschtassenrandes" },
    "epitett_zuhanyzo_kialakitasa": { cat: "ELŐKÉSZÍTÉS / KŐMŰVES MUNKÁK", huf: 150000, eur: 560, unit: "átalány", hu: "Épített zuhanyzó kialakítása", de: "Herstellung einer bodengleichen Dusche" },
    "epitett_uloke_ulotalapzat_kialakitasa_a_zuha": { cat: "ELŐKÉSZÍTÉS / KŐMŰVES MUNKÁK", huf: 120000, eur: 450, unit: "db", hu: "Épített ülőke / ülőtalapzat kialakítása a zuhanyzóban", de: "Herstellung einer gemauerten Sitzbank im Duschbereich" },
    "tapadohid_felvitele": { cat: "ELŐKÉSZÍTÉS / KŐMŰVES MUNKÁK", huf: 3000, eur: 25, unit: "m²", hu: "Tapadóhíd felvitele", de: "Auftragen einer Haftgrundierung" },
    "hajlaterosito_szalag_agyazasa": { cat: "ELŐKÉSZÍTÉS / KŐMŰVES MUNKÁK", huf: 2000, eur: 10, unit: "fm", hu: "Hajlaterősítő szalag ágyazása", de: "Einbettung des Dichtbandes in den Eckbereichen" },
    "vizszigeteles_kenheto_foliaval": { cat: "ELŐKÉSZÍTÉS / KŐMŰVES MUNKÁK", huf: 3000, eur: 25, unit: "m²", hu: "Vízszigetelés kenhető fóliával", de: "Abdichtung mit Flüssigfolie" },
    "gipszkarton_falak_helyreallitasa": { cat: "ELŐKÉSZÍTÉS / KŐMŰVES MUNKÁK", huf: 6000, eur: 25, unit: "m²", hu: "Gipszkarton falak helyreállítása", de: "Instandsetzung der Gipskartonwände" },

    // --- SZÁRAZÉPÍTÉSZET ---
    "futescsovek_dobozolasa": { cat: "SZÁRAZÉPÍTÉSZET", huf: 55000, eur: 200, unit: "átalány", hu: "Fűtéscsövek dobozolása", de: "Verkleidung der Heizungsrohre" },
    "gipszkarton_valaszfal_hanggatlo_szigetelesse": { cat: "SZÁRAZÉPÍTÉSZET", huf: 35000, eur: 130, unit: "m²", hu: "Gipszkarton válaszfal hanggátló szigeteléssel", de: "Gipskarton-Trennwand mit Schalldämmung" },
    "gipszkarton_almennyezet_keszitese": { cat: "SZÁRAZÉPÍTÉSZET", huf: 12000, eur: 45, unit: "m²", hu: "Gipszkarton álmennyezet készítése", de: "Herstellung einer abgehängten Gipskartondecke" },

    // --- FALPANEL ---
    "falpanelek_ragasztasa_a_zuhanyterben": { cat: "FALPANEL", huf: 12000, eur: 35, unit: "m²", hu: "Falpanelek ragasztása a zuhanytérben", de: "Verklebung von Wandpaneelen im Duschbereich" },
    "falpanelek_ragasztasa_meglevo_csempeburkolat": { cat: "FALPANEL", huf: 12000, eur: 30, unit: "m²", hu: "Falpanelek ragasztása meglévő csempeburkolatra / előkészített falra", de: "Verklebung von Wandpaneelen auf bestehendem Fliesenbelag bzw. vorbereitetem Untergrund" },
    "elvedozes": { cat: "FALPANEL", huf: 3000, eur: null, unit: "m", hu: "Élvédőzés", de: "" },

    // --- MIKROCEMENT ---
    "mikrocement_bevonat_keszitese_meglevo_csempe": { cat: "MIKROCEMENT", huf: 22000, eur: 80, unit: "m²", hu: "Mikrocement bevonat készítése meglévő csempeburkolatra", de: "Mikrozementbeschichtung auf bestehendem Fliesenbelag" },

    // --- HIDEGBURKOLÁS ---
    "burkolasi_munkak_reszterulet": { cat: "HIDEGBURKOLÁS", huf: 95000, eur: 360, unit: "átalány", hu: "Burkolási munkák – részterület", de: "Fliesenarbeiten auf Teilflächen" },
    "falak_hidegburkolasa_standard_meretu_lappal": { cat: "HIDEGBURKOLÁS", huf: 16000, eur: 60, unit: "m²", hu: "Falak hidegburkolása standard méretű lappal (max. 60×120 cm)", de: "Verlegung von Wandfliesen im Standardformat (bis max. 60×120 cm)" },
    "felmoso_szegely_hidegburkolasa": { cat: "HIDEGBURKOLÁS", huf: 6000, eur: 20, unit: "fm", hu: "Felmosó szegély hidegburkolása", de: "Verlegung eines Fliesensockels" },
    "kad_elotetfal_hidegburkolasa": { cat: "HIDEGBURKOLÁS", huf: 60000, eur: 225, unit: "db", hu: "Kád előtétfal hidegburkolása", de: "Fliesen der Badewannenverkleidung" },
    "kad_elotetfalazasa_es_hidegburkolasa_komplet": { cat: "HIDEGBURKOLÁS", huf: 125000, eur: 460, unit: "db", hu: "Kád előtétfalazása és hidegburkolása – komplett", de: "Herstellung und Fliesen der Badewannenverkleidung – komplett" },
    "padlo_hidegburkolasa_standard_meretu_lappal": { cat: "HIDEGBURKOLÁS", huf: 16000, eur: 60, unit: "m²", hu: "Padló hidegburkolása standard méretű lappal (max. 60×60 cm)", de: "Verlegung von Bodenfliesen im Standardformat (bis max. 60×60 cm)" },
    "padlolap_bevagasa_zuhanytalca_helyenek_kiala": { cat: "HIDEGBURKOLÁS", huf: 14000, eur: 52, unit: "db", hu: "Padlólap bevágása zuhanytálca helyének kialakításához", de: "Einschneiden der Bodenfliesen für den Duschtassenbereich" },
    "wc_allvany_hidegburkolasa_es_elvedozese": { cat: "HIDEGBURKOLÁS", huf: 55000, eur: 205, unit: "db", hu: "WC-állvány hidegburkolása és élvédőzése", de: "Fliesen und Kantenschutz am WC-Vorwandelement" },

    // --- VINYL BURKOLÁS ---
    "vizallo_vinyl_padloburkolat_kivitelezese": { cat: "VINYL BURKOLÁS", huf: 8000, eur: 30, unit: "m²", hu: "Vízálló vinyl padlóburkolat kivitelezése", de: "Verlegung eines wasserbeständigen Vinylbodenbelags" },

    // --- FESTÉS / GLETTELÉS ---
    "falfelulet_festese_2_retegben": { cat: "FESTÉS / GLETTELÉS", huf: 4000, eur: 15, unit: "m²", hu: "Falfelület festése 2 rétegben", de: "Zweimaliger Anstrich der Wandflächen" },
    "falfelulet_glettelese": { cat: "FESTÉS / GLETTELÉS", huf: 4000, eur: 15, unit: "m²", hu: "Falfelület glettelése", de: "Spachteln der Wandflächen" },
    "peneszedesgatlo_latex_festes_2_retegben": { cat: "FESTÉS / GLETTELÉS", huf: 4000, eur: 15, unit: "m²", hu: "Penészedésgátló latex festés 2 rétegben", de: "Zweimaliger Anstrich mit schimmelhemmender Latexfarbe" },

    // --- VILLANYSZERELÉS ---
    "foldelt_dugalj_kialakitasa": { cat: "VILLANYSZERELÉS", huf: 25000, eur: 95, unit: "db", hu: "Földelt dugalj kialakítása", de: "Herstellung einer Schutzkontakt-Steckdose" },
    "foldelt_dugalj_athelyezese": { cat: "VILLANYSZERELÉS", huf: 25000, eur: 95, unit: "db", hu: "Földelt dugalj áthelyezése", de: "Versetzen einer Schutzkontakt-Steckdose" },
    "kapcsolhato_mennyezeti_lampa_kiallas_kialaki": { cat: "VILLANYSZERELÉS", huf: 30000, eur: 110, unit: "db", hu: "Kapcsolható mennyezeti lámpa kiállás kialakítása", de: "Herstellung eines schaltbaren Deckenauslasses für eine Leuchte" },
    "allando_aramellatas_kialakitasa_mosdoszekren": { cat: "VILLANYSZERELÉS", huf: 25000, eur: 95, unit: "db", hu: "Állandó áramellátás kialakítása mosdószekrény / világítás részére", de: "Herstellung einer Dauerstromversorgung für Waschtischmöbel / Beleuchtung" },

    // --- SZERELVÉNYEZÉS ---
    "camargue_szanitermodul_beszerelese": { cat: "SZERELVÉNYEZÉS", huf: 70000, eur: 260, unit: "db", hu: "Camargue szanitermodul beszerelése", de: "Montage und Anschluss des Camargue-Sanitärmoduls" },
    "elektromos_vizmelegito_felszerelese_es_vizol": { cat: "SZERELVÉNYEZÉS", huf: 60000, eur: 225, unit: "db", hu: "Elektromos vízmelegítő felszerelése és vízoldali bekötése", de: "Montage und wasserseitiger Anschluss des Elektro-Warmwasserspeichers" },
    "furdoszobai_wc_kiegeszitok_felszerelese": { cat: "SZERELVÉNYEZÉS", huf: 10000, eur: 35, unit: "db", hu: "Fürdőszobai / WC kiegészítők felszerelése", de: "Montage von Bad- und WC-Accessoires" },
    "ideiglenes_megoldas_provizorium_felszerelese": { cat: "SZERELVÉNYEZÉS", huf: 20000, eur: 70, unit: "átalány", hu: "Ideiglenes megoldás / provizórium felszerelése", de: "MONTAGE EINES PROVISORIUMS" },
    "kiegeszito_furdoszobai_szekreny_felszerelese": { cat: "SZERELVÉNYEZÉS", huf: 20000, eur: 75, unit: "db", hu: "Kiegészítő fürdőszobai szekrény felszerelése", de: "Montage eines zusätzlichen Badezimmerschranks" },
    "kis_mosdo_felszerelese": { cat: "SZERELVÉNYEZÉS", huf: 25000, eur: 95, unit: "db", hu: "Kis mosdó felszerelése", de: "Montage und Anschluss eines Handwaschbeckens" },
    "kadcsaptelep_felszerelese": { cat: "SZERELVÉNYEZÉS", huf: 25000, eur: 95, unit: "db", hu: "Kádcsaptelep felszerelése", de: "Montage der Badewannenarmatur" },
    "kadparavan_felszerelese": { cat: "SZERELVÉNYEZÉS", huf: 45000, eur: 165, unit: "db", hu: "Kádparaván felszerelése", de: "Montage eines Badewannenaufsatzes" },
    "mosdocsaptelep_felszerelese": { cat: "SZERELVÉNYEZÉS", huf: 15000, eur: 55, unit: "db", hu: "Mosdócsaptelep felszerelése", de: "Montage der Waschtischarmatur" },
    "mosdoszekreny_felszerelese": { cat: "SZERELVÉNYEZÉS", huf: 35000, eur: 130, unit: "db", hu: "Mosdószekrény felszerelése", de: "Montage des Waschtischunterschranks" },
    "mosogep_bekotese": { cat: "SZERELVÉNYEZÉS", huf: 15000, eur: 55, unit: "db", hu: "Mosógép bekötése", de: "Anschluss der Waschmaschine" },
    "toltoszelep_csereje_az_oblitotartalyban": { cat: "SZERELVÉNYEZÉS", huf: 15000, eur: 55, unit: "db", hu: "Töltőszelep cseréje az öblítőtartályban", de: "TAUSCH DES FÜLLVENTILS IN SPÜLKASTEN" },
    "tukros_szekreny_felszerelese": { cat: "SZERELVÉNYEZÉS", huf: 30000, eur: 110, unit: "db", hu: "Tükrös szekrény felszerelése", de: "Montage des Spiegelschranks" },
    "tukros_szekreny_villamossagi_bekotese": { cat: "SZERELVÉNYEZÉS", huf: 20000, eur: 75, unit: "db", hu: "Tükrös szekrény villamossági bekötése", de: "Elektrischer Anschluss des Spiegelschranks" },
    "wc_csesze_felszerelese": { cat: "SZERELVÉNYEZÉS", huf: 30000, eur: 110, unit: "db", hu: "WC-csésze felszerelése", de: "Montage und Anschluss des WC-Beckens" },
    "wc_nyomolap_felszerelese": { cat: "SZERELVÉNYEZÉS", huf: 10000, eur: 35, unit: "db", hu: "WC-nyomólap felszerelése", de: "Montage der WC-Betätigungsplatte" },
    "wc_oblitotartaly_csereje": { cat: "SZERELVÉNYEZÉS", huf: 35000, eur: 130, unit: "db", hu: "WC-öblítőtartály cseréje", de: "TAUSCH DES WC SPÜLKASTENS" },
    "zuhanycsaptelep_es_zuhanyszett_felszerelese": { cat: "SZERELVÉNYEZÉS", huf: 30000, eur: 110, unit: "db", hu: "Zuhanycsaptelep és zuhanyszett felszerelése", de: "Montage der Duscharmatur und Brausegarnitur" },
    "zuhanyfal_szabadonallo_uvegfal_felszerelese": { cat: "SZERELVÉNYEZÉS", huf: 140000, eur: 520, unit: "db", hu: "Zuhanyfal / szabadonálló üvegfal felszerelése", de: "Montage einer Duschtrennwand / freistehenden Glaswand" },
    "zuhanykabin_felszerelese": { cat: "SZERELVÉNYEZÉS", huf: 65000, eur: 240, unit: "db", hu: "Zuhanykabin felszerelése", de: "Montage der Duschkabine" },
    "bide_felszerelese": { cat: "SZERELVÉNYEZÉS", huf: 65000, eur: 240, unit: "db", hu: "Bidé felszerelése", de: "Montage des Bidets" },

    // --- BEFEJEZŐ MUNKÁK ---
    "fugazas": { cat: "BEFEJEZŐ MUNKÁK", huf: 2000, eur: 5, unit: "m²", hu: "Fugázás", de: "Verfugung" },
    "szaniter_szilikonozas_hezagtomites": { cat: "BEFEJEZŐ MUNKÁK", huf: 2000, eur: 5, unit: "fm", hu: "Szaniter szilikonozás / hézagtömítés", de: "Sanitärsilikonfugen / elastische Fugenabdichtung" },

    // --- EGYÉB ---
    "kiszallas": { cat: "EGYÉB", huf: 65000, eur: 240, unit: "alkalom", hu: "Kiszállás", de: "Anfahrt" },

    // --- BONTÁS ---
    "falicsempe_bontasa_m2": { cat: "BONTÁS", huf: 4500, eur: 17, unit: "m²", hu: "Falicsempe bontása / levésése", de: "Abbruch / Entfernen der Wandfliesen" },
};

// The two rows that have no Austrian price yet fall back to this, the
// median HUF:EUR ratio of the 176 rows that do have one.
export const FT_PER_EUR_FALLBACK = 268.3;

// One rate, in the currency being quoted. Throws on an unknown id: a silent 0
// would quietly under-quote the whole job, which is exactly the failure this
// price list exists to remove.
export function rate(id, currency) {
    const it = PRICE_LIST[id];
    if (!it) throw new Error("Ismeretlen torzsarlista tetel: " + id);
    if (currency === "eur") return it.eur != null ? it.eur : it.huf / FT_PER_EUR_FALLBACK;
    return it.huf;
}

// The item's own name, in the customer's language. The workbook carries a real
// German trade name per row; English falls back to Hungarian and is translated
// by the existing label layer.
export function itemName(id, lang) {
    const it = PRICE_LIST[id];
    if (!it) return id;
    return (lang === "de" && it.de) ? it.de : it.hu;
}
