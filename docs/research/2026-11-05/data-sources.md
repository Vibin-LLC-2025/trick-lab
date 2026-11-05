# Measured data sources for skateboard flight and feet

Research cutoff and access date: 2026-11-05. Prepared for trick-lab. No project files were modified.

## Findings that change the data strategy

The best new physical baseline is a 2025 engineering study with component masses and a complete-board inertia tensor. The strongest recent human-trick measurements are a 2026 independent IMU validation study with reference measurements of ollie and kickflip height and airtime. Neither supplies synchronized shoe and board trajectories. For foot orientation, FootMR and its October 2026 extension ExMR are particularly relevant, but their remaining errors and non-commercial licenses prevent treating them as an automatic route to accurate production data. Sources and qualifications follow.

I did not verify a freely available, measured 3D dataset containing both shoes and the board throughout all ten requested tricks. A commercial optical mocap pack does explicitly capture rider and board together. Its coverage and export suitability need checking before purchase. My recommended data path is a small, owner-controlled, calibrated video capture with manual contact annotation, using AI only as an initialization.

### Scope and evidence rules

Read for background: `C:\dev\trick-lab\docs\RESEARCH-FEET.md`, including its source list and estimate labels. I do not repeat its Frederick, Determan, Delft optimal-control, muscle-synergy, or qualitative trick-tip entries as new evidence. Older sources below were not in that list and are explicitly dated.

Searches covered general scholarly indexing and targeted PubMed, arXiv, engrXiv, ResearchGate, Sports Biomechanics, Journal of Sports Sciences, ISBS proceedings, Scientific Reports, Frontiers, World Skate, USOPC/USA skateboarding, and Japanese institute pages, with English and selected Japanese terms. Google Scholar-targeted indexed searches were used, but I did not obtain an exhaustive live Scholar results export or subscription-database search. This is a focused research report, not a systematic review. Publisher and author sources take priority over aggregators. A failed full-text fetch is identified; no inaccessible material is represented as read.

Confidence means confidence in the stated quantity for its stated conditions, not universal applicability:

- **High:** directly inspectable primary measurement or explicit official documentation with clear scope.
- **Medium:** credible measurement with small samples, operational-definition issues, limited methods, or computed rather than experimentally identified parameters.
- **Low:** miniature experiment, ambiguous table, marketing claim, unverified coverage, or extrapolation.
- **Unknown:** no trustworthy numerical value verified. Unknown is not a zero.

Numbers marked **computed**, **assumed**, **illustrative**, or **proposed** are not measurements. Software benchmark errors are not skateboarding trajectory accuracy. Publication dates use absolute dates where available; where a source gives only a year or issue month, that limitation is preserved.

## 1. New biomechanics and engineering evidence

### S01. Validity of a Commercially Available Inertial Measurement Unit for Artificial Intelligence-Based Trick Detection and Kinematic Performance Assessment in Skateboarding

- **Authors/date:** Birte Scholz, Niklas Noth, Maren Witt, Olaf Ueberschär; 2026-04-20; Sensors 26(8), 2537.
- **URLs/read:** [Publisher](https://www.mdpi.com/1424-8220/26/8/2537), [PubMed](https://pubmed.ncbi.nlm.nih.gov/42076649/), [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC13119854/). Read PubMed abstract and indexed full-text methods/results extracts. Direct publisher requests also returned HTTP 429; direct PMC opening encountered a browser check.
- **Numbers:** 23 participants. Paired reference height counts: ollie 56, kickflip 26; paired airtime counts: 81 and 37. Reference means and dispersions are in the final quantity table. Kickflip IMU height MAE 13.83 cm, airtime MAE 0.49 s.
- **Use/confidence:** Medium for these cohort reference values; high confidence that this tested sensor/app cannot supply interchangeable biomechanical outputs. Height refers to the paper's skateboard measurement definition, not rider COM rise. Fixed lateral videometry used a 9 cm board reference for calibration. Missing values/imputation and event definitions limit reuse. Do not infer flick or catch timestamps from these summaries.

### S02. Professional skateboarding trousers design: according to the three-dimensional kinematic analysis for varied skateboarding manoeuvres

- **Authors/date:** Xiao Wei, Jin Zhou; 2024, volume 75 issue 1; exact publication day not supplied in the inspected PDF.
- **URL/read:** [Publisher full-text PDF](https://www.revistaindustriatextila.ro/images/2024/1/010%20XIAO%20WEI%20INDUSTRIA%20TEXTILA%20no.1_2024.pdf), DOI 10.35530/IT.075.01.202388. Read methods and results, including extracted Table 2.
- **Numbers:** Seven subjects, 16 lower-body markers, three captures per maneuver. Kickflip performed by three subjects, heelflip by two. Table 2 reports kickflip knee maximum 108.7°, minimum -16.1°, range 124.8°; heelflip maximum 134.4°, minimum 5.0°, range 129.4°.
- **Use/confidence:** Low for direct angle calibration. The same table reports an ollie knee maximum of 228.9° and a pop-shove maximum/minimum ordering that is internally inconsistent in the extracted text. Coordinate conventions, angle wrapping, table errors, and very small trick samples require clarification. These are whole-maneuver extrema, not peak-flight knee flexion. Board pose and shoe-contact timing are not supplied as reusable numerical trajectories. Useful evidence that lower-limb mocap exists, not a ready foot animation specification.

### S03. Automatic temporal event detection of the Ollie movement during skateboarding using wearable IMUs

- **Authors/date:** Xinyao Hu, Fenjie Liang, Zhimeng Fang, Xingda Qu, Zhong Zhao, Zhanbing Ren, Wenfei Cai. First online 2021-10-21; assigned to Sports Biomechanics 23(11), November 2024, pages 2006-2020. Issue day unspecified.
- **URL/read:** [PubMed abstract](https://pubmed.ncbi.nlm.nih.gov/34672867/), DOI 10.1080/14763141.2021.1990384. Abstract read; full paper not read.
- **Numbers:** Defines four events: take-off, peak height, front-wheel landing, rear-wheel landing, and three derived phases. The abstract gives no actual event times, sample means, or error magnitudes.
- **Use/confidence:** High for existence and publication history; unknown for usable numerical trajectories. S01's prior-work table attributes nine skateboarders and timing error below 5 ms to it, but I did not verify that number in this primary paper. Do not turn that secondary summary into a validated specification. This is a 2024 issue assignment of earlier work, not a newly conducted 2024 experiment.

### S04. Biomechanische Analyse des Skateboardtricks "Ollie"

- **Author/date:** Georg Köstler; University of Vienna thesis, 2025; exact publication day not supplied on the record.
- **URL/read:** [University repository abstract and metadata](https://utheses.univie.ac.at/detail/74547). Abstract only, not the 62-page thesis.
- **Numbers:** Eight men, 200 jumps across a battery including countermovement, single-leg, ollie and switch ollie. Front-leg single-leg jump correlated with ollie height at r = 0.836; rear-leg single-leg jump height exceeded the front by a mean 3.95 cm.
- **Use/confidence:** Medium for reported study summary. No absolute ollie flight durations or shoe trajectories verified. The English abstract describes a negative relationship while printing one positive correlation sign, another reason not to extract a control law from the abstract alone. Potential author-contact route for raw force/Vicon data, not an immediately downloadable trajectory source.

### S05. Cushioning mechanism of the metatarsals during landing for the skateboarding ollie maneuver

- **Authors/date:** Yusen Wu, Haichun Wang, Cheng Deng, Yangyu Guo, Xiaolan Zhu; 2024-04-22; Frontiers in Bioengineering and Biotechnology 12:1382161.
- **URL/read:** [Publisher full text](https://www.frontiersin.org/journals/bioengineering-and-biotechnology/articles/10.3389/fbioe.2024.1382161/full). Read methods, validation, and selected results.
- **Numbers:** Measured standing peak plantar pressure 125 kPa; modeled 116.27 kPa; reported validation error 6.98%. The model assigns friction coefficient 0.6 to frictional interfaces including shoe/deck.
- **Use/confidence:** Medium for standing pressure validation; low for interpreting 0.6 as a measured shoe/grip coefficient. It is an input assumption, not a tribometer measurement. This finite-element study concerns landing cushioning, not flick trajectories, catch timing, or full-size board restitution. It should not be used to prescribe shoe motion.

### S06. Skating into the Unknown: Scoping the Physical, Technical, and Tactical Demands of Competitive Skateboarding

- **Authors/date:** Shelley N. Diewald, Jono Neville, John B. Cronin, David Read, Matt R. Cross; 2024-05-14; Sports Medicine 54, 1399-1418.
- **URL/read:** [Publisher full text](https://link.springer.com/article/10.1007/s40279-024-02032-1). Read abstract, technical-demand discussion, and limitations.
- **Numbers:** 19 original articles included. The authors found no evidence measuring athlete or board rotational speed during specific tricks to relate it to performance.
- **Use/confidence:** High for the state of the reviewed literature, not proof that no later study exists. Supports treating a universal measured kickflip rate as an evidence gap. The review also warns that static laboratory tasks and inconsistent definitions limit transfer to competitive skating. No new per-trick trajectories are supplied.

### S07. Relevant Biomechanical Variables in Skateboarding: A Literature Review

- **Authors/date:** Juan Baus, Ethan Nguyen, John R. Harry, James Yang; 2024, Critical Reviews in Biomedical Engineering 52(4), 29-39; exact publication day not available in inspected record.
- **URL/read:** [PubMed](https://pubmed.ncbi.nlm.nih.gov/38780104/), DOI 10.1615/CritRevBiomedEng.2024052903. Abstract and metadata only.
- **Numbers:** No extractable trick-motion numerical values in the abstract.
- **Use/confidence:** High for bibliographic verification; unknown for additional numerical information in the unread full text. Useful discovery review, not a source for model constants in this report.

### S08. Successful KickFlip: Dynamic Analysis and Influencing Factors of the Skateboard KickFlip Motion

- **Author/date:** Yuchen Zhong; 2026-03-31; Scientific Journal of Intelligent Systems Research 8(3), 84-100.
- **URLs/read:** [Publisher](https://bcpublication.org/index.php/SJISR/article/view/9283), [ResearchGate full-text extraction](https://www.researchgate.net/publication/403397798_Successful_KickFlip_Dynamic_Analysis_and_Influencing_Factors_of_the_Skateboard_KickFlip_Motion), DOI 10.54691/s83rde35. Read abstract, model derivation, instrument table, experimental setup, and initial results.
- **Numbers:** Test board model 300 g, equivalent length 303.72 mm, width 120 mm, table height 644 mm. Example forcing 5 N at [0.0895, 0.0425, 0] m. Instrument table gives time uncertainty ±0.025 s. Abstract claims roll-curve agreement within ±5%.
- **Use/confidence:** Low for full-size human kickflips. This is a miniature-board experiment, not measured athlete shoes. Simplified torque-free angular/Euler treatment and changing axis descriptions require scrutiny. Do not scale its flip rate or inertia straight into trick-lab. CC BY-NC 4.0. A relevant 2026 hit, but substantially weaker evidence than its title suggests.

### S09. Design of a lightweight skateboard truck: a framework for optimizing sports equipment under real conditions

- **Authors/date:** Felix Pfister, Marcel Bartz, Sandro Wartzack; 2025-08-27; Proceedings of the Design Society 5, 1205-1214; DOI 10.1017/pds.2025.10134.
- **URLs/read:** [Publisher full text](https://www.cambridge.org/core/journals/proceedings-of-the-design-society/article/design-of-a-lightweight-skateboard-truck-a-framework-for-optimizing-sports-equipment-under-real-conditions/E40865CB859BE7B4B2FB035EC1B77AFA), [author-uploaded full text with Table 1 extraction](https://www.researchgate.net/publication/395007145_Design_of_a_lightweight_skateboard_truck_a_framework_for_optimizing_sports_equipment_under_real_conditions). Read methods, results and table. Publisher table-image fetch failed.
- **Numbers:** Benchmark masses and CAD inertias are in the final quantity table. Optimized complete: 2.288 kg; longitudinal/transverse/vertical inertias 0.009188 / 0.105189 / 0.110388 kg m². Converted from kg mm² by multiplying by 10^-6.
- **Use/confidence:** Medium-high for this assembly; computed inertias, not pendulum measurements. Strongest found full-size board baseline. Verify figure axes before mapping to app coordinates. Not a population mean. Article license CC BY-NC-ND 4.0.

### S10. HUSKY: Humanoid Skateboarding System via Physics-Aware Whole-Body Control

- **Authors/date:** Jinrui Han, Dewei Wang, Chenyun Zhang, Xinzhe Liu, Ping Luo, Chenjia Bai, Xuelong Li; arXiv first submission 2026-02-03.
- **URL/read:** [Full-text HTML](https://arxiv.org/html/2602.03205v1). Read abstract, reference-motion description and Appendix G.
- **Numbers:** Rectangular-prism inertia approximations for two board plants: 0.00715 and 0.00870 kg m². Measured decay periods 0.107 and 0.185 s for steering/tilt identification.
- **Use/confidence:** Medium for that identification model; low as a full street-board inertia tensor. These are plant approximations for coupled truck/board control, not a measured yaw tensor or flip-trick capture. The task is pushing and steering, not kickflip or catch. Useful recent physics precedent, with clearly limited relevance.

### S11. 3D Kinematic Analysis of the Ollie Maneuver on the Skateboard

- **Authors/date:** Luana Bianchini Wood, Ana Oliveira, Karini Santos, André Rodacki, Jerusa Lara; 2020-07-01; Apunts 141, 87-91. Older, newly identified source.
- **URLs/read:** [Publisher article](https://revista-apunts.com/en/3d-kinematic-analysis-of-the-ollie-maneuver-on-the-skateboard/), [publisher issue PDF, pages 87-91](https://revista-apunts.com/wp-content/uploads/2020/06/APUNTS-141-1.pdf). Read abstract and relevant full-text results/table extraction.
- **Numbers:** Six men, 34 body markers, four board markers, 11 Vicon cameras at 100 Hz. Reported board COM height change about 0.24 ± 0.01 m; rider COM rise 0.18 ± 0.07 m static and 0.18 ± 0.06 m rolling.
- **Use/confidence:** Medium for the small-sample height comparison. The board peak precedes rider COM peak. Table angles have very large dispersions and need convention checks, so I do not recommend them as anatomical targets. COM is modeled geometrically; do not equate this displacement to S01's ground-clearance height. Raw trajectories not verified public.

### Olympic and institute search outcome

No public Paris 2024 or LA 2028 preparation release with synchronized full-size board pose, both shoes, and the requested events was verified. JISS/HPSC and Japanese academy pages establish access to motion analysis, not access to raw trick measurements. Olympic status alone does not make a source a kinematics dataset.

**S12. Sports medicine/science support services.** Japan Sport Council, HPSC/JISS; undated, accessed 2026-11-05. [Official page](https://www.jpnsport.go.jp/hpsc/business/ourwork/support/tabid/1315/Default.aspx). Read page text. It describes motion capture, force measurement and video feedback; no relevant trick numbers. High confidence about services, unknown about public skate data.

**S13. USOPC Internally Managed Sports, Skateboarding, 2025 Athlete and Sport Program Plan.** USOPC; updated 2025-03-03. [Official PDF](https://assets.contentstack.io/v3/assets/blteb7d012fc7ebef7f/blt46916b664818a947/67c5e59ac66031ac85203b29/SKB_2025_Athlete_and_Sport_Program_Plan_Updated_3.3.25.pdf). Indexed document extract only. No usable flight/feet measurements verified. High confidence as an institutional lead; no numerical-model evidence extracted.

## 2. Datasets and animation data: what is actually usable

The distinction is between captured motion, reconstructed pseudo-ground truth, synthetic motion, and video labels. A dataset with "skating" or "foot-skate" in its description does not necessarily contain skateboarding. License statements below are factual summaries of the inspected pages, not a grant of additional rights.

### S14. Motion-X and Motion-X++

- **Authors/date:** Motion-X: Jing Lin, Ailing Zeng and colleagues, NeurIPS 2023. Motion-X++: Yuhong Zhang, Jing Lin, Ailing Zeng and colleagues; first submitted 2025-01-09.
- **URLs/read:** [Motion-X project](https://motion-x-dataset.github.io/), [license](https://motion-x-dataset.github.io/static/license/Motion-X%20License.pdf), [Motion-X++ abstract](https://arxiv.org/abs/2501.05098), [full-text methods](https://arxiv.org/html/2501.05098v1).
- **Numbers:** Motion-X 81.1K sequences; Motion-X++ 120.5K sequences, 19.5M poses, 80.8K RGB videos.
- **Labels/board/feet:** Semantic text labels and SMPL-X body fits; no verified named-trick subset or synchronized board-pose stream. Skateboarding inclusion was not independently established from a downloadable manifest. Ground-contact regularization cannot establish contact with a moving board.
- **License:** Motion-X annotations CC BY-NC-SA 4.0, with underlying subset licenses retained. Do not assume the extension or each original video has identical permissions without checking its release.
- **Confidence:** High on published scale/license, low on target-trick coverage and foot-contact suitability. Search HAA500-derived sequences first if access is already available; do not download the whole corpus expecting measured shoes.

### S15. HAA500: Human-Centric Atomic Action Dataset with Curated Videos

- **Authors/date:** Jihoon Chung, Cheng-hsin Wuu, Hsuan-ru Yang, Yu-Wing Tai, Chi-Keung Tang; ICCV 2021; exact release day not established.
- **URLs/read:** [Project and v1.1 download description](https://www.cse.ust.hk/haa/), [official class explorer](https://www.cse.ust.hk/haa/explore.html). Read pages/class list.
- **Numbers:** 500 action classes, more than 591K labeled frames.
- **Labels/board/feet:** Verified classes include Skateboard Grind, Skateboard Forward and Skateboard Jump. No separate kickflip/heelflip/catch labels, board 6-DoF, or measured 3D feet. Videos could supply reference images; foot pose would need estimation and verification.
- **License:** Motion-X's official license describes HAA500 as MIT licensed. I did not independently inspect a HAA500 video-rights grant; YouTube footage rights remain a separate question.
- **Confidence:** High for skateboarding-class inclusion, low for measured trajectory use.

### S16. HumanML3D, AMASS, and the CMU subset caveat

- **Authors/date:** HumanML3D: Chuan Guo and colleagues, CVPR 2022. AMASS: Naureen Mahmood and colleagues, ICCV 2019. CMU Graphics Lab database: legacy, current page undated.
- **URLs/read:** [Official HumanML3D README](https://github.com/EricGuo5513/HumanML3D), [AMASS license](https://amass.is.tue.mpg.de/license.html), [CMU source](https://mocap.cs.cmu.edu/), [CMU motion index](https://mocap.cs.cmu.edu/search.php). Read documentation/license and indexed motion names.
- **Numbers:** HumanML3D uses 22 joints and 20 fps. CMU contains 2,605 trials; its index includes subject 85 clips called KickFlip/KickFlipStumble under jumps/flips/breakdance.
- **Labels/board/feet:** I did not verify a genuine on-board skateboard sequence. The CMU names are insufficient to identify a skateboard trick. Neither standard HumanML3D nor AMASS representation supplies board transforms. Sparse toe/ankle data is not a measured shoe sole.
- **License:** AMASS custom non-commercial research license; original-source and body-model terms apply. CMU's own source permits commercial inclusion, disallows direct resale, and warns toe joints are noisy. That does not override AMASS terms for AMASS conversions.
- **Confidence:** High on structure/terms, unknown on genuine skateboard-trick coverage.

### S17. BEDLAM and BEDLAM2.0: Synthetic Humans and Cameras in Motion

- **Authors/date:** BEDLAM2: Joachim Tesch, Giorgio Becherini, Prerana Achar, Anastasios Yiannakidis, Muhammed Kocabas, Priyanka Patel, Michael J. Black. Dataset released 2025-09-22; full image/depth mirror announced 2026-02-26. Original BEDLAM is CVPR 2023.
- **URLs/read:** [Official release](https://bedlam2.is.tuebingen.mpg.de/), [license](https://bedlam2.is.tuebingen.mpg.de/license.html). Project, data description and terms read.
- **Numbers:** 27,480 sequences, 30 fps, about eight million images. BEDLAM2 adds shoes missing from original BEDLAM.
- **Labels/board/feet:** Synthetic body/camera ground truth. I found no verified skateboard trick subset, tracked skateboard, or measured shoe-board contact. Synthetic shoe presence improves training relevance, not measurement provenance.
- **License:** Custom non-commercial scientific research, education and artistic-use terms; redistribution prohibited.
- **Confidence:** High on release details, low as a target-motion source. A training/evaluation resource, not a substitute for capturing a skater.

### S18. SkateboardAI: The Coolest Video Action Recognition for Skateboarding

- **Author/date:** Hanxiao Chen; AAAI 2023 student abstract; arXiv record first submitted 2023-08-02.
- **URLs/read:** [Primary paper](https://ojs.aaai.org/index.php/AAAI/article/download/26952/26724), [author repository](https://github.com/2000222/Skateboard-AI). Paper text and README read.
- **Numbers:** 750 videos, 15 classes, 50 per class. Includes ollie, kickflip, shuvit, hardflip, and treflip.
- **Labels/board/feet:** Trick-level labels, no measured 3D board or feet. Does not establish all requested tricks or frontside/backside distinctions. A useful clip-discovery source rather than motion capture.
- **License:** Repository says MIT; clips collected from YouTube, Twitter and Instagram. MIT on the repository is not evidence that all audiovisual rights were cleared for redistribution or commercial reuse.
- **Confidence:** High for documented dataset design; low for physical measurements and independent footage-rights coverage.

### S19. Additional small skateboard video/keypoint releases

- **Title/outlet/date:** Skateboard-Trick-Recognition-using-Machine-Learning, piotrekskt, repository date unspecified; accessed 2026-11-05. [Creator README](https://github.com/piotrekskt/Skateboard-Trick-Recognition-using-Machine-Learning). Read README only. It reports 307 creator-curated original videos across five tricks, including ollie, kickflip, pop shuv-it and 360 flip. No measured 3D board/feet. Dataset license not verified. Medium for stated inventory, low for usable trajectory data.
- **Title/outlet/date:** Skateboarding tricks, Skatespace/Roboflow; model timestamp 2025-07-11. [Publisher card](https://universe.roboflow.com/skatespace/skateboarding-tricks). Read card only. It reports 40 source images and a 96-image dataset version, keypoint task, skateboard/benihana classes, CC BY 4.0. No verified temporal or metric 3D data. Low as a biomechanical source; useful only for exploring board-keypoint annotation.

### S20. Kinetics and FineGym

- **Authors/date:** Kinetics: Will Kay and Google DeepMind colleagues, 2017; Kinetics-700-2020 documented 2020. FineGym: Dian Shao, Yue Zhao, Bo Dai, Dahua Lin, CVPR 2020. Exact initial release days not established here.
- **URLs/read:** [Kinetics maintainer README](https://github.com/cvdfoundation/kinetics-dataset), [official Kinetics-400 labels](https://raw.githubusercontent.com/google-deepmind/kinetics-i3d/master/data/label_map.txt), [FineGym official page](https://sdolivia.github.io/FineGym/). Read dataset descriptions and label list.
- **Numbers:** Kinetics versions cover 400/600/700 action classes, roughly ten-second clips. FineGym provides hierarchical gymnastics annotations.
- **Labels/board/feet:** Kinetics-400 explicitly includes the broad class "skateboarding", without board-pose or shoe-contact ground truth; exact requested-trick coverage was not verified. FineGym is gymnastics, not a skateboard-trick dataset. Neither provides a measured target 3D trajectory stream.
- **License:** Dataset annotations/software and original video rights must be distinguished; I did not verify a current all-video commercial license from these pages. FineGym is not recommended for this project regardless of its annotation license.
- **Confidence:** High for task mismatch and absent pose channels, low for direct application.

### S21. Skateboarding Trick Kinematic Component Dataset

- **Authors/date:** David Purser, Amanda Benson, Kath Shorter; posted 2026-07-28.
- **URL/read:** [Primary Figshare record](https://figshare.swinburne.edu.au/articles/dataset/Skateboarding_Trick_Kinematic_Component_Dataset/31746838), DOI 10.25916/sut.31746838.v1. Record read; data file not downloaded.
- **Numbers:** 70 unique trick definitions using discrete flip, shuv and rider-spin components.
- **Labels/board/feet:** Taxonomy data, not sampled kinematics. No per-frame board tracking or feet. Useful for checking trick nomenclature and rotation counts, not trajectories.
- **License:** Primary record's copyright statement specifies CC BY-NC-ND 4.0. An NLM catalog summary labels it CC BY-NC 4.0, so prefer the stricter primary statement until clarified.
- **Confidence:** High for taxonomy relevance, no trajectory accuracy claim.

### S22. Skate-BFM Simulation Dataset

- **Outlet/date:** Yak9Ce3teeh on Hugging Face; exact initial release date not established; inspected 2026-11-05.
- **URL/read:** [Dataset README](https://huggingface.co/datasets/Yak9Ce3teeh/skate-sim-dataset/blob/main/README.md). Full card text read.
- **Numbers:** 50 Hz; training continuous set 890 motions, 445,000 frames, from 158 simulated rollouts.
- **Labels/board/feet:** Synchronized HUSKY robot-board rollouts with phase labels. Board and robot states are simulation data, not measured human flip tricks. No demonstrated coverage of the ten tricks. Robot end-effectors are not shoe articulation.
- **License:** Card says "other"; no clear downstream grant verified.
- **Confidence:** High that the release is simulation, low as a trustworthy human reference. It should not be mixed into a measured dataset without a separate provenance class.

### S23. Skateboard, Flatground Skate Tricks, commercial synchronized optical mocap

- **Outlet/date:** Reallusion, Monkey Chow Animation Studios and Motion Capture Orlando; production article 2024-09-20; performer Brian Ortiz; capture inspiration Nelson Escobar; technical explanation by Jeff Scheetz.
- **URL/read:** [Official production article](https://magazine.reallusion.com/2024/09/20/the-making-of-skateboard-capturing-the-dynamic-animation-of-skateboarding/). Indexed full article text read; one direct fetch timed out. No asset files inspected.
- **Numbers:** 26 flatground motions; FBX and BVH delivery advertised. Vicon Shogun used to construct the skateboard rig and synchronize prop and rider motion.
- **Labels/board/feet:** Explicitly tracks the moving board separately from the rider. Stronger match than human-only datasets. Exact coverage of heelflip, hardflip, doubles and all shoves, sample rate, raw markers, processing, and foot-detail accuracy were not verified.
- **License/confidence:** Commercial asset product, not public research data. Medium for provenance, unknown for scientific accuracy. Check paired board export, clip list and scale before buying. BVH normally cannot carry the same accessory information as a paired FBX/Motion+ workflow.

**S24. Reallusion Content End User License Agreement.** Reallusion; updated 2026-11-01. [Current official EULA](https://www.reallusion.com/Content/EULA/EULA.htm), [license overview](https://www.reallusion.com/license/content.html?id=license-contact-form). Read relevant Standard/Enterprise sections. No motion measurements. Standard permits specified integrated commercial applications subject to extraction restrictions; standalone asset redistribution and AI/model-validation uses are restricted or require additional authorization. High confidence about the displayed terms, but product-specific suitability is unresolved. A browser app distributing directly extractable motion arrays deserves explicit vendor clarification. No purchase or contact was made.

## 3. Video-to-trajectory methods current to 2026-11-05

### S25. FootMR, Improving 3D Foot Motion Reconstruction in Markerless Monocular Human Motion Capture

- **Authors/date:** Tom Wehrbein, Bodo Rosenhahn; 3DV 2026; arXiv submitted 2026-03-10.
- **URLs/read:** [Paper](https://arxiv.org/html/2603.09681v1), [official code](https://github.com/twehrbein/FootMR), [license](https://github.com/twehrbein/FootMR/blob/main/LICENSE). Read method, results, appendix and code documentation.
- **Numbers:** MOYO ankle angle error improves from 37.3° to 25.9° against the best temporal comparison. MOOF has 41 videos at 30 fps, 14,589 annotated frames; three foot landmarks per side.
- **Use/confidence:** High that dedicated foot refinement improves these benchmarks, medium-low for unseen skateboarding. Refines ankle orientation from local 2D feet plus knee/ankle context. It does not measure board pose or sole contact, and residual errors remain large for precise flick geometry. MOOF is ankle exercises/dance/gymnastics, not verified skateboarding.
- **License:** Code is a GVHMR derivative restricted to educational, research and non-profit use. SMPL-X and detector assets have separate terms. Do not equate public code with commercial production permission.

### S26. ExMR, Extremity Motion Refinement for Monocular Human Motion Capture

- **Authors/date:** Tom Wehrbein, Bodo Rosenhahn; arXiv submitted 2026-10-19. Repository announced demo code 2026-10-21 and v0.1.5 on 2026-10-29. This is a preprint, not verified accepted journal publication.
- **URLs/read:** [Full-text preprint](https://arxiv.org/html/2610.26213v1), [official code](https://github.com/twehrbein/ExMR), [installation notes](https://raw.githubusercontent.com/twehrbein/ExMR/main/docs/INSTALL.md). Read methods, foot results and setup.
- **Numbers:** Revised foot module reduces MOYO ankle error from 25.3° to 20.4°; foot landmark error 32.2 to 25.7 mm. Setup reports about 8 GB VRAM, measured peak 7.4 GB on a 1080 × 1920 video using RTX 4090.
- **Use/confidence:** Best directly relevant recent foot-specific candidate found, not certified skate-trick measurement. SMPL-X export is useful for initializing trajectories. No board tracking. Ground snapping must not pin airborne or board-supported feet to pavement.
- **License/platform:** Educational/research/non-profit code terms, gated SAM 3D Body assets and body-model registration. Official path is Linux/WSL2; native Windows unsupported upstream. RTX 3060 12 GB is plausible for inference, untested here; 6 GB variant is below documented budget.

### S27. GVHMR, World-Grounded Human Motion Recovery via Gravity-View Coordinates

- **Authors/date:** Zehong Shen, Huaijin Pi, Yan Xia, Zhi Cen, Sida Peng, Zechen Hu, Hujun Bao, Ruizhen Hu, Xiaowei Zhou; SIGGRAPH Asia 2024. Repository also identifies a TPAMI 2026 version; exact journal date not verified here.
- **URLs/read:** [Official code/README](https://github.com/zju3dv/GVHMR), [license](https://github.com/zju3dv/GVHMR/blob/main/LICENSE). Documentation and license read.
- **Numbers:** No skateboarding-specific accuracy number verified.
- **Use/confidence:** Medium for initial global SMPL-X trajectories. Static-camera mode and ExMR/FootMR compatibility are practical strengths. FootMR's evidence shows body-level accuracy does not ensure correct ankle rotations. Board pose/contact remain separate tasks.
- **License:** Educational, research and non-profit purposes only; commercial use requires separate permission. Do not use a model's foot-ground contact probabilities as board-contact labels.

### S28. WHAC and TRAM, camera-aware 2024 alternatives

- **WHAC title/authors/date:** WHAC: World-grounded Humans and Cameras; Wanqi Yin, Zhongang Cai and colleagues; arXiv 2024-03-19, ECCV 2024. [Primary paper](https://www.ecva.net/papers/eccv_2024/papers_ECCV/papers/04945.pdf), [project](https://wqyin.github.io/projects/WHAC/). Read abstract and relevant comparison text. Specifically discusses translation without limb-motion cues, including skateboarding, as problematic for contact-based trajectory estimates. No measured trick constants. Medium as a reconstruction alternative.
- **TRAM title/authors/date:** TRAM: Global Trajectory and Motion of 3D Humans from in-the-wild Videos; Yufu Wang, Ziyun Wang, Lingjie Liu, Kostas Daniilidis; first submitted 2024-03-26, ECCV 2024. [Paper record](https://arxiv.org/abs/2403.17346), [author project](https://yufu-wang.github.io/tram4d/), [code](https://github.com/yufu-wang/tram). Abstract/project documentation read. Uses metric camera recovery plus body-motion estimation. No board, contact or skate-foot error numbers verified. Medium as a body initializer; licenses not audited for this recommendation.

### S29. SAM 3D Body: Robust Full-Body Human Mesh Recovery

- **Authors/date:** Xitong Yang, Devansh Kukreja, Don Pinkus and Meta colleagues; public SAM 3D announcement 2025-11-19; paper submitted 2026-02-17.
- **URLs/read:** [Primary paper abstract](https://arxiv.org/abs/2602.15989), [official repository](https://github.com/facebookresearch/sam-3d-body), [official README](https://raw.githubusercontent.com/facebookresearch/sam-3d-body/main/README.md), [release announcement](https://ai.meta.com/blog/sam-3d/). Abstract and docs read.
- **Numbers:** No skateboarding-specific error, contact-timing precision, or RTX 3060 benchmark verified.
- **Use/confidence:** Strong per-image body/feet/hands estimator with keypoint/mask prompts and MHR body representation. Single-image shape recovery is not a metric time-series measurement; temporal and camera treatment still required. It underlies newer pipelines, but is not a board tracker. Body, object reconstruction, and segmentation are distinct products. Model/assets have their own gated access and terms; this report does not assume an unrestricted SMPL replacement.

### S30. FlowHMR: Physically Plausible Motion Capture from Video

- **Authors/date:** Zhanke Wang, Chengfeng Zhao, Qing Shuai and colleagues; arXiv submitted 2026-10-02; repository demo announcement 2026-10-31.
- **URLs/read:** [Primary abstract](https://arxiv.org/abs/2610.03691), [official code](https://github.com/flowhmr/flowhmr), [linked weights card](https://huggingface.co/fafsaf1/flowhmr-0.46B/blob/main/README.md?code=true). Abstract, README and licensing statement read.
- **Numbers:** 0.46 billion parameters; reported physics-controller tracking success 82.47% on Wild-4K. This is not foot-contact measurement accuracy.
- **Use/confidence:** Interesting current candidate; low for trustworthy skateboard contacts without validation. A physics prior can prefer a plausible alternative over the actual unusual movement. No skateboard tracking or trick-specific metrology verified.
- **License:** Source Apache 2.0; weights non-commercial educational/research/non-profit. Third-party models retain separate terms. Do not infer commercial permission from the source license. Not the first setup to spend a few-day budget on.

### S31. GENMO/GEM-X, a licensing alternative to investigate

- **Authors/date:** Jiefeng Li, Jinkun Cao, Haotian Zhang, Davis Rempe, Jan Kautz, Umar Iqbal, Ye Yuan; GENMO ICCV 2025. GEM-X model card lists GitHub release 2026-03-16; exact paper-day not verified.
- **URLs/read:** [NVIDIA official code](https://github.com/NVlabs/GEM-X), [model card](https://huggingface.co/nvidia/GEM-X/blob/main/README.md). Documentation read.
- **Numbers:** 77-joint SOMA output, including body, hands and face.
- **Use/confidence:** Medium for documented capabilities; unknown for shoe-board contacts or RTX 3060 performance. Worth investigating if a production-compatible model license is essential. No measured target-trick dataset or exact contact timestamps verified.
- **License:** Code Apache 2.0; associated model governed by NVIDIA Open Model License, with third-party notices retained. Verify every downloaded component rather than assuming it follows the code license.

### S32. FoundationPose: Unified 6D Pose Estimation and Tracking of Novel Objects

- **Authors/date:** Bowen Wen, Wei Yang, Jan Kautz, Stan Birchfield; first preprint 2023-12-13, CVPR 2024.
- **URLs/read:** [Primary paper](https://arxiv.org/abs/2312.08344), [official implementation](https://github.com/NVlabs/FoundationPose), [actual license](https://raw.githubusercontent.com/NVlabs/FoundationPose/main/LICENSE). Abstract, setup description and license read.
- **Numbers:** Estimates six pose degrees of freedom; no skateboard flip benchmark verified.
- **Use/confidence:** Medium for a controlled RGB-D/CAD setup, low for ordinary internet slow motion. Its model-free option does not mean no depth/reference requirements. Thin boards, wheel geometry, rapid flipping, underside changes and occlusion are untested failure cases for this use. Predicted monocular depth should not be relabeled as measured depth.
- **License:** NVIDIA code license restricts use to non-commercial research/evaluation. Separate weights/dependencies must also be checked.

### S33. GoTrack: Generic 6DoF Object Pose Refinement and Tracking

- **Authors/date:** Van Nguyen Nguyen, Christian Forster, Sindi Shkodrani, Vincent Lepetit, Bugra Tekin, Cem Keskin, Tomas Hodan; submitted 2025-06-08, CVPR workshop 2025.
- **URLs/read:** [Primary abstract](https://arxiv.org/abs/2506.07155), [official README](https://github.com/facebookresearch/gotrack), [license](https://raw.githubusercontent.com/facebookresearch/gotrack/main/LICENSE). Abstract, pipeline description and license read.
- **Numbers:** Six pose degrees of freedom; no target-trick error numbers verified.
- **Use/confidence:** Medium as an RGB-only board-tracking experiment. Requires CAD, camera intrinsics and initial pose; repository combines CNOS, FoundPose and GoTrack. Better conceptual fit to RGB footage than pretending FoundationPose has measured depth. Must validate nose/tail and top/bottom identity through edge-on frames. No guarantee of successful skateboard tracking.
- **License:** CC BY-NC 4.0. Not an automatic commercially unrestricted production path.

### S34. RGBTrack: Fast, Robust Depth-Free 6D Pose Estimation and Tracking

- **Authors/date:** Teng Guo, Jingjin Yu; first submitted 2025-06-20.
- **URL/read:** [Primary abstract](https://arxiv.org/abs/2506.17119). Abstract only.
- **Numbers:** No independently checked speed or accuracy values extracted.
- **Use/confidence:** Medium-low as a candidate: extends FoundationPose-style render/compare with true-scale CAD and RGB-only depth search. Relevant successor direction, not verified skateboarding support. Code readiness, license and RTX 3060 operation were not established, so it is not the concrete recommendation.

**Other 2026 lead:** [FoundationPose--](https://github.com/ziqin-h/FoundationPose--) is a public fork describing faster registration and RGB-only estimation. Repository title/description inspected; publication date, peer review, license changes and skateboarding validation were not verified. No performance claim from this fork is adopted as measured skate data.

### S35. Kinovea

- **Title/outlet/date:** Kinovea 2025.2.0; Kinovea project/Joan Charmant; release/download page updated 2026-03-21.
- **URLs/read:** [Official download and license](https://www.kinovea.org/download/), [calibration documentation](https://www.kinovea.org/help/en/measurement/calibration.html). Read official pages.
- **Numbers:** Version 2025.2.0; no skateboarding accuracy benchmark in these docs. S01 independently used older Kinovea 2023.1.2.
- **Use/confidence:** High for manual 2D digitizing, frame stepping, calibration and trajectory export. It does not magically recover depth. A planar calibration applies to its plane; the ground-plane homography cannot calibrate an airborne shoe at a different depth.
- **License/platform:** GPL v2, free including commercial use; Windows 7-11 with .NET 4.8. Best low-friction starting tool for this Windows workstation. No GPU required for the core manual task.

### S36. Tracker Video Analysis and Modeling Tool

- **Authors/date:** Douglas Brown, Wolfgang Christian, Robert M. Hanson; version 6.3.5 released 2026-06-22 according to the official change log.
- **URLs/read:** [Official site](https://opensourcephysics.github.io/tracker-website/), [change log](https://opensourcephysics.github.io/tracker-website/change_log.html). Read features, release log and license.
- **Numbers:** 6.3.5 adds moving-average, Butterworth and Savitzky-Golay filtered clones. No task-specific accuracy figure.
- **Use/confidence:** High as a manual/automatic 2D point tracker and basic ballistic-model comparison tool. Smoothing should preserve the discontinuities at pop, flick and catch. Autotracking must be checked during board flips and occlusion.
- **License:** GPL v3; free/open source. Cross-platform alternative to Kinovea, not calibrated monocular 3D capture by itself.

### S37. DLTdv8

- **Author/date:** Ty Hedrick, UNC Hedrick Lab; DLTdv8 release documented 2020-08-20; current page inspected 2026-11-05. No verified newer major-release date.
- **URLs/read:** [Official lab page](https://biomech.web.unc.edu/dltdv/), [official repository](https://github.com/tlhedrick/dltdv). Documentation and repository description read.
- **Numbers:** No skateboard-specific accuracy or new 2026 performance numbers.
- **Use/confidence:** High for established multi-view digitizing/calibration workflow; DLTdv8 adds deep-learning-assisted 2D/3D tracking. Its value is calibrated simultaneous views, not a learned plausibility prior.
- **License/platform:** Code BSD-3-Clause. MATLAB or applicable packaged-runtime requirements remain separate. Best fit if the developer already has the environment; avoid making a new paid MATLAB setup the critical path for a few days of work.

## 4. High-speed footage and licensing

### S38. Skateology, original high-speed reference series

**Creator:** Adam Shomsky. **Read:** original YouTube descriptions/indexed metadata, not downloaded raw videos or a frame-by-frame measurement in this research run. **Confidence:** High for creator-stated recording settings and named tricks; medium for future manual measurement after timebase checks; unknown for metric 3D without calibration. These older clips remain more useful than many newer uncalibrated edits.

| Source title and original URL | Publication date | Specific numbers and scope actually verified |
| --- | --- | --- |
| [Skateology: kickflip (1000 fps slow motion)](https://www.youtube.com/watch?v=wfCgCXvw50A) | 2011-06-17 | Redlake N3, 1,000 fps, 1280 × 720; multiple named skaters |
| [Skateology: Double kickflip (1000 fps slow motion)](https://www.youtube.com/watch?v=-cjh0INfn0M) | 2010-08-22 | Redlake N3, 1,000 fps, 1280 × 720; multiple named skaters |
| [Skateology: Heelflip (1000 fps slow motion)](https://www.youtube.com/watch?v=ggvnTbBPh-E) | 2012-05-06 | Redlake N3, 1,000 fps, 1280 × 720; Mike Krok |
| [Skateology: 360 flip (1000 fps slow motion)](https://www.youtube.com/watch?v=QuOcEBS8Qfk) | 2011-06-10 | Redlake N3, 1,000 fps, 1280 × 720; multiple named skaters |
| [Skateology: Hardflip (1000 fps slow motion)](https://www.youtube.com/watch?v=aMCuW4PdoDQ) | 2011-01-05 per indexed upload metadata | Redlake N3, 1,000 fps, 1280 × 720. Creator explicitly links a replacement version |
| [Skateology: hardflip part 2](https://www.youtube.com/watch?v=nJ540O6y63Y) | 2015-08-11 | Sony FS700, 240 and 480 fps; Brennan Richman. Prefer this over assuming every example in the earlier compilation is canonical |
| [Skateology: Frontside 360 shuvit](https://www.youtube.com/watch?v=8HjICyiu6n0) | 2015-07-31 | Sony FS700, 240 and 480 fps; Joe Vizzaccero. This is frontside, not evidence for backside 360 shove-it timing |

The known varial-kickflip link `https://www.youtube.com/watch?v=X0dxKbJ08d4` appeared in secondary listings, but direct opening failed. A backside-pop-shuv Skateology entry appeared in a secondary index, without verified original upload metadata. Neither is counted as a measured source here.

Licensing: no permissive reuse license was verified for these videos. Seek original, unretimed footage and permission from the creator for distribution, fitting, and intended commercial use. Multiple viewpoints in a compilation may be different attempts. They cannot be triangulated as if they were synchronized cameras on one attempt.

### S39. Other footage sources checked

- **Olympics Skateboarding, Men's Street Skateboarding Final, Paris Replays.** Official verified channel; uploaded 2024-09-08. [Original replay](https://www.youtube.com/watch?v=lnGvPESpmjY). Description/metadata read, not the complete replay. No verified capture fps or motion measurements. High confidence for provenance, low for calibration: edits, panning, fisheye/perspective, obstacles and replay retiming complicate reconstruction. Publicly viewable broadcast is not an open mocap license; obtain appropriate rights before redistributing footage or packaged derived assets.
- **Red Bull Hart Lines Skateboarding in Slow Motion.** Red Bull-branded upload; legacy 2015-era footage, exact day not established. [Publisher account on Dailymotion](https://www.dailymotion.com/video/x2q2m4i). Publisher description read. No verified 1,000 fps specification or per-trick timestamps. Medium as a viewing reference, low as quantitative data. Brand production does not supply camera calibration or a reuse grant.
- **The Slow Mo Guys, Tony Hawk Ramping Things Up.** Episode dated 2018-02-07 in secondary program listings. Original upload settings were not independently verified. A [WIRED interview with the creators](https://www.wired.com/video/watch/the-slow-mo-guys-break-down-slow-motion-videos) confirms they filmed Tony Hawk; transcript extract read. No usable frame count or calibrated flight values extracted. Medium for existence, low for this flatground measurement task. Do not label it a 1,000 fps reference without the actual clip settings.
- **Braille slow-motion playlist.** [Verified channel upload/playlist description](https://www.youtube.com/watch?v=SpvUZwVyTUU), dated 2014-12-21. Description only; title absent in indexed result. No verified 240/1,000 fps specification or measured event interval. Useful for clip discovery, not numerical timing until the original timebase is established. No reusable video license verified.

**S40. License types on YouTube.** YouTube Help, undated, accessed 2026-11-05. [Official documentation](https://support.google.com/youtube/answer/2797468?hl=en). Page read. No motion numbers. Standard license is the default; CC BY is a distinct option. High confidence. Do not assume standard uploads are freely licensed datasets. Requesting a usable original is also the simplest way to resolve retiming uncertainty.

### Critical timebase limitation

A 1,000 fps camera clip played back at 30 fps is not timed using 1/30 s per displayed frame. If each delivered frame corresponds to one captured frame, event duration is frame difference divided by 1,000. If frames were dropped, duplicated, interpolated, speed-ramped, or exported through another timebase, the relation must be reconstructed. A public video description stating camera fps does not establish the complete time mapping of the edited upload.

For freshly recorded 240 fps material, the ideal frame period is **4.167 ms**, compared with **1 ms** at 1,000 fps. These are computed sampling intervals, not achieved measurement accuracy. One-frame uncertainty at each of two independently picked event boundaries gives up to **8.33 ms** interval uncertainty at 240 fps before synchronization, blur, rolling shutter, or occlusion errors. An occluded contact event needs an uncertainty interval, not an invented exact frame.

## 5. Physical parameters and numerical coaching evidence

### S41. Cushioned grip tape, US6921566B2

- **Author/date:** Evan Lipstein; patent published/granted 2005-07-26. Older, newly identified measurement source.
- **URL/read:** [Patent full text, experimental example](https://patents.google.com/patent/US6921566B2/en). Read example and test description.
- **Numbers:** Mean static shoe/grip coefficient 0.85 for conventional uncushioned tape, 1.2 for the patented cushioned specimen. A weighted shoe was pulled to measure onset of sliding, with an incline comparison.
- **Use/confidence:** Low-medium. Actual reported comparison, but patent evidence with product interest and incomplete modern shoe/condition coverage. The conventional value is a provisional baseline, not a universal suede-sidewall flick coefficient. Static sole friction, dynamic sliding and edge contact are different quantities.

### S42. Science Vs. Skateboarding: What's The Best Grip Tape?

- **Outlet/date:** Tactics; posted 2023-06-16.
- **URL/read:** [Retailer's experimental write-up](https://www.tactics.com/info/best-grip-tape). Methods and results text read, not numerical chart images.
- **Numbers:** Pull tests repeated three times using a Vans Half Cab. Wet grip reduced measured pull traction by about 1-2 pounds-force, approximately 4.45-8.90 N by unit conversion. Incline tests also performed; exact angles were not extracted.
- **Use/confidence:** Low-medium. Useful practical measurement precedent, but no verified normal load sufficient to convert the reported loss into a coefficient. Not a measured flick/catch timing source. More trustworthy than inventing a common flip duration, but still a retailer experiment.

### S43. Potential application of recycled plastic materials as a replacement for polyurethane wheels

- **Authors/date:** B. Thomas, S. Martinez, M. Hadfield; WIT Transactions on Engineering Sciences 76, 2012; exact day not supplied in inspected paper.
- **URL/read:** [Publisher full-text PDF](https://www.witpress.com/Secure/elibrary/papers/TD12/TD12009FU1.pdf). Read material samples, methods and conclusions.
- **Numbers:** 97A-99A wheel samples; reciprocating tests at 0.05 and 0.2 m/s, 10-40 N. Reported PU sliding coefficients about 0.10-0.15 against asphalt. Initial concrete samples degraded/smoothed excessively, so asphalt was used.
- **Use/confidence:** Medium for the described reprocessed-material/tribometer comparison; low for rolling complete wheels on concrete. Do not misquote this as a wheel-concrete coefficient, rolling resistance, or wheel restitution. The paper's assumed aggregate wheel-set mass is not used as a modern street-wheel mass measurement.

### S44. Spitfire Wheels Tablet Shape

- **Outlet/date:** Weartested; 2019-09-09.
- **URL/read:** [Original test/review](https://www.weartested.com/spitfire-wheels-tablet-shape/). Full article text read.
- **Numbers:** 52 mm Tablet wheel 53 g; comparison Radial 56 g. Tablet width 29 mm, riding surface 20 mm; Radial width 32.5 mm, riding surface 19 mm. Tested over two months.
- **Use/confidence:** Medium for these specific wheels; limited weighing-method detail. Better than retail shipping weights, which often include packaging. A set of four 53 g wheels is 212 g by arithmetic, excluding bearings and spacers. Reweigh the actual board components for final calibration.

### What is and is not measured

S09 supplies deck, truck, complete-board mass, and all three calculated moments. S44 supplies a practical wheel mass. S41 supplies limited measured static shoe/grip friction. S43 supplies wheel-material sliding friction on asphalt only. S05's coefficient 0.6 is explicitly a model input assumption.

I did not verify a transferable, measured polyurethane-wheel/concrete restitution value or dry sliding coefficient for a standard street setup. Rubber-pneumatic tire tables, industrial Mecanum rollers, polyurethane footwear heels and material rebound percentages are not equivalent substitutes. Restitution must specify impacting bodies, orientation, speed and load. Tail/concrete impact is also a different collision from wheel/concrete landing.

I did not find a new, well-controlled numerical tail-strike impulse or contact-duration dataset. Existing force-plate peaks in the background research are not board-only tail impulses. No new source supports a universal foot clearance, fixed catch fraction, or constant flick rate across the ten tricks.

### Numerical coaching rules

No additional trusted coaching source with a documented frame-count-to-capture-fps derivation of typical flip duration, flick delay or catch time was verified. I therefore add no coaching timing constant. Tactics S42 is retained as lower-confidence experimental evidence. Published numerical examples based on assumed ballistic heights are calculations, not athlete observations. The background report's fitted placement and phase values should continue to be labeled estimates until calibrated video supports them.

## 6. Why motion looks wrong, and game-development precedent

### S45. UnderPressure: Deep Learning for Foot Contact Detection, Ground Reaction Force Estimation and Footskate Cleanup

- **Authors/date:** Lucas Mourot, Ludovic Hoyet, François Le Clerc, Pierre Hellier; arXiv 2022-08-09, Computer Graphics Forum 2022.
- **URLs/read:** [Primary abstract](https://arxiv.org/abs/2208.04598), [publisher paper](https://diglib.eg.org/bitstream/handle/10.1111/cgf14635/v41i8pp195-206.pdf). Abstract and introduction extracts read.
- **Numbers:** No skateboard-specific perceptual threshold verified.
- **Use/confidence:** High for contact/foot-sliding being a recognized animation problem; medium for transferring the insight to a moving skateboard. This is not a study of viewers judging kickflips. It motivates coherent contact handling, not a universal number of centimeters of acceptable shoe error.

### S46. Skater XL, General Development Update #2 and adjacent developer updates

- **Outlet/date:** Easy Day Studios official Steam announcements; General Development Update #2 dated 2019-06-20. An adjacent IK-fix announcement is older within the same archive; its exact day was not extracted.
- **URL/read:** [Official developer archive](https://store.steampowered.com/news/posts/?appids=962730&enddate=1561137336&feed=steam_community_announcements). Read mocap-production and IK-conflict passages.
- **Numbers:** Describes hundreds of animation pieces, no physical constants or contact thresholds.
- **Use/confidence:** High for documented design precedent: motion sensors on Walker Ryan's shoes and board; captured animation sliced and adapted to physics-driven control; IK maintains foot placement, and the developer explicitly reports conflicts between animation and IK. "Physics-driven" does not mean a full biomechanical foot-force solver or that animation is absent.

### S47. Get shredding in Session: Skate Sim with these developer tips

- **Author/date:** Jack Ridsdale interviewing producer Jeff Spicer; Red Bull; 2022-09-22 at 16:00 UTC.
- **URL/read:** [Original developer interview](https://www.redbull.com/int-en/session-skate-sim-release-tips). Indexed full interview text read; direct page rendering exposed no readable lines.
- **Numbers:** Two sticks represent the feet; no measured contact coefficients or timing constants.
- **Use/confidence:** High for developer-described control and tuning concepts. It exposes adjustable wheel grip, pop height and board/rider separation, and emphasizes believable execution. It does not document the exact collision solver, contact impulse model, or per-trick trajectories. Treat it as design precedent, not physical evidence. This adds production detail rather than repeating the background report's control instructions.

### Derived implications for trick-lab, not new experimental findings

1. Give each shoe independent **position, orientation, contact state and contact patch**. An ankle point cannot distinguish sole contact, outside-sidewall slide, toe-edge flick and heel release.
2. Store feet in world space during separation. After a catch, use board-relative contact constraints where appropriate. Parenting shoes to the board through the flip causes impossible rotations; imposing zero world velocity on a board-supported shoe causes sliding.
3. Treat pop, flick/scoop, free flight, first-foot catch, second-foot catch and wheel landing as separate events. Rotation should respond to contacts; do not make both feet touch while the board continues its predetermined flip through them.
4. Do not use a generic ease-out of Euler roll as a substitute for measured catch. Fit board orientations as quaternions/rotation matrices with a continuous path, preserve full-turn counts, and use contact events to explain changes. Coupled roll/yaw tricks need full 3D orientation, not just independent angles added in arbitrary order.
5. Track absolute height carefully: board clearance, board COM, rider COM and shoe height are distinct. A bent knee can raise the board relative to the rider without increasing rider COM jump height.
6. Evaluate still-frame overlay and ordinary-speed playback with skilled skaters. I found no 2024-2026 controlled skateboard-specific viewer study establishing numerical tolerances for flick angle, catch timing, or rotation error. These checks are proposed validation, not measured perception thresholds.

## 7. Per-trick coverage from new sources

| Requested trick | Best new measurement or reference route | What remains missing |
| --- | --- | --- |
| Ollie | S01 reference height/airtime; S03 event definitions; S04 thesis lead; S11 older body-plus-board mocap | Public raw shoe-board trajectories and force/contact series |
| Kickflip | S01 reference height/airtime; S02 sparse joint extrema; S38 original high-speed compilation | Measured roll-rate time series, flick and per-foot catch timestamps |
| Heelflip | S02 two-subject lower-limb capture; S38 1,000 fps reference | Trustworthy time-resolved board and shoe data |
| Backside pop shove-it | S02 pop-shove capture has unclear direction/table values; video discovery leads only | Direction-confirmed raw 3D trajectory and contacts |
| Frontside pop shove-it | Owner-controlled capture is strongest practical path | Verified recent measured kinematics |
| Varial flip | S18 video-class discovery is incomplete; secondary Skateology link needs verification | Verified primary high-speed timebase and metric trajectories |
| Hardflip | S18 labeled videos; S38 replacement high-speed reference | Validated distinction among variants and simultaneous 3D contacts |
| 360 flip, tre flip | S18 labeled videos; S38 high-speed reference | Public measured board angular velocity and both feet through catch |
| 360 shove-it | S38 verified frontside 360 shuvit reference; confirm intended direction | Backside-specific measured trajectories if that is the intended preset |
| Double kickflip | S38 1,000 fps reference | Measured rate, airtime distribution, catch and shoe orientations |

The commercial S23 pack may fill some rows, but exact clip-level coverage was not verified. Do not infer it contains a trick from the generic words "spin" or "flip."

## 8. Quantity -> best value -> source -> confidence

Values below are the most defensible found, with scope attached. They are not a complete set of universal preset constants. Source IDs link to the fully documented entries above.

| Quantity | Best value or action | Source | Confidence and boundary |
| --- | --- | --- | --- |
| Complete street-board mass | 2.422 kg benchmark | S09, Table 1 | Medium-high for that assembly |
| Deck mass | 1.400 kg | S09 | Medium-high, specific deck |
| One truck mass | 0.346 kg, 139 Stage 11 Hollow | S09 | Medium-high; two trucks per complete |
| One street-wheel mass | 0.053 kg, 52 mm Tablet | S44 | Medium, excludes bearings |
| Board roll inertia about long axis | 0.009627 kg m² | S09, computed CAD | Medium-high; not a direct inertia measurement |
| Board pitch inertia about transverse axis | 0.111683 kg m² | S09, computed CAD | Medium-high; check frame mapping |
| Board yaw inertia about vertical axis | 0.116865 kg m² | S09, computed CAD | Medium-high; check frame mapping |
| Maximum ollie skateboard height above ground | 0.4139 ± 0.1795 m | S01, video reference | Medium; cohort and operational definition matter |
| Maximum kickflip skateboard height above ground | 0.3487 ± 0.1318 m | S01, video reference | Medium; not COM displacement |
| Ollie airtime | 0.36 ± 0.09 s | S01, OptoJump reference | Medium; compare event definition to app |
| Kickflip airtime | 0.41 ± 0.06 s | S01, OptoJump reference | Medium; do not substitute IMU-app output |
| Older ollie board COM rise | About 0.24 ± 0.01 m | S11 | Medium; distinct from ground clearance |
| Typical full-size kickflip roll rate | No verified measured population value | S06 gap; S08 miniature excluded | Unknown; measure orientation versus original time |
| Double-kickflip roll rate | No verified value | S38 is a source for future digitization | Unknown; do not simply double an assumed kickflip rate |
| BS/FS shove and tre angular velocity | No verified time series | Capture workflow below | Unknown; full 3D orientation needed |
| Flick delay from tail strike/take-off | No verified value | Capture workflow below | Unknown; preserve separate event definitions |
| Front/back foot board-release time | No verified value | Capture workflow below | Unknown; annotate visible/occluded intervals |
| Front/back catch time and order | No universal measured value found | S38 / owner-controlled video | Unknown until annotated per trial |
| Foot clearance and lateral excursion | No verified universal centimeter target | Two-view shoe landmarks | Unknown; measure in world and board frames |
| Peak-flight knee flexion | No robust transferable target found | S02 table cautions; S11 convention cautions | Low; avoid blindly using whole-trick maxima |
| Horizontal speed/travel during each trick | No verified transferable trick-specific values | Calibrated video | Unknown; rolling-distance tests are not airborne travel |
| Tail/concrete strike duration and impulse | No new trustworthy value found | Direct high-speed/force measurement needed | Unknown; rider GRF peak is not tail impulse |
| Static shoe sole/grip coefficient | 0.85 conventional specimen; 1.2 cushioned specimen | S41 patent test | Low-medium; surface and contact specific |
| Dynamic shoe-sidewall/grip friction | No verified value | Direct test needed | Unknown; do not reuse sole static value blindly |
| Shoe/deck friction in 2024 FE model | 0.6 input assumption | S05 | Low as physical evidence; not measured |
| PU wheel-material/asphalt sliding coefficient | About 0.10-0.15 | S43 | Medium for test, low for intact wheels/concrete |
| PU wheel/concrete sliding or rolling coefficient | No matching measured value verified | S43 explicitly used asphalt | Unknown; sliding and rolling resistance differ |
| Wheel/concrete restitution | No verified matching value | Direct controlled impact test | Unknown; material rebound percentage is insufficient |
| Ideal video sampling interval | 4.167 ms at 240 fps; 1 ms at 1,000 fps | Arithmetic using verified capture rates | High mathematically; not achieved precision |
| New foot-pose estimator residual error | About 20° ankle error on MOYO in ExMR comparison | S26 | Medium benchmark evidence, not skateboarding validation |

## 9. Ranked recommendation and a concrete few-day workflow

### Ranked data paths

1. **Recommended single path: owner-controlled synchronized two-view 240 fps video, calibrated and manually audited.** Capture the actual board, shoes and skilled rider; digitize rigid-board landmarks and shoe toe/heel/side landmarks. This provides inspectable provenance, known scale, useful timing and control over rights. It also resolves the core missing information: changing relative motion and contact between three bodies. Feasibility depends on access to two suitable cameras and a rider able to perform the target tricks. It does not depend on the RTX 3060.
2. **Licensed synchronized optical-mocap asset or a small custom capture from its producer.** S23 is the closest verified existing product. It could be more efficient if clip coverage, board export and usage rights match the app. Scientific fidelity remains unvalidated; inspect a sample against source footage. Purchase only after a concrete coverage/export/rights check. No current price or purchase recommendation is assumed.
3. **Permissioned original high-speed footage plus manual 2D reconstruction and an AI body initializer.** Ask for unretimed originals from S38. Good event timing and visible shoe geometry are possible; unobserved depth remains uncertain. ExMR/FootMR are research candidates subject to their licenses, not guaranteed production tools. Use a permissively licensed alternative such as the documented GEM-X route only after auditing all model terms and validating the output.
4. **General public motion datasets or robot simulation.** Useful for method development and broad motion priors, inefficient for the requested board-foot metrology. Do not spend the first days downloading entire AMASS/Motion-X/BEDLAM releases or training a new model.

### Day 1: acquire and validate a small capture

This is a proposed plan, not work performed in this research run.

- Use two locked-off phones/cameras that genuinely record 240 fps, in good light, viewing the same flat-ground trial from substantially different angles. Use a sufficiently short exposure to resolve shoe edges and board markings. Disable digital stabilization and avoid panning/zooming if possible. Record full rider and board for one view, enough shoe detail for the other.
- Calibrate intrinsics/lens distortion at the actual recording mode, then both camera extrinsics over the capture volume. A ground square alone only calibrates ground points. Use a checkerboard or known 3D calibration object at several heights. Include a rigid length reference and surveyed board dimensions.
- Synchronize using a common visible event such as a pulsed light or clapper, then check drift and actual frame timestamps. Phones are not genlocked; retain synchronization uncertainty. Keep original files and an explicit mapping from every extracted frame to physical time.
- Put distinctive lightweight marks on known board locations, including asymmetry that distinguishes nose/tail and top/bottom. At least one elevated/non-coplanar landmark near truck geometry or a second calibrated view helps with pose ambiguity. Use visible heel, toe and outer-forefoot shoe landmarks. Avoid markings that change grip/contact mechanics.
- Record three successful trials per trick if the rider can perform them reliably, retaining failures separately. Record stance, footwear, board geometry/masses, direction, speed and surface. Start with ollie, kickflip and tre flip as three contrasting contact patterns. Do not substitute a frontside 360 shove for the requested backside version.

### Day 2: obtain measured timing and trajectories before installing complex models

- Use **Kinovea 2025.2** for visible 2D landmarks and frame/event annotation. Use **DLTdv8** if its calibrated multi-view environment is already available, or a small conventional camera-calibration/triangulation workflow with documented reprojection checks. These are established geometry calculations, not a generated motion prior.
- For every trial record: crouch minimum, first front-wheel lift, tail strike, last board-ground contact, each foot's release, flick/scoop exit, rotation milestones, board apex, first catch, second catch, first wheel landing and settled roll-away. Define events operationally before annotation. The tail strike, rider take-off and board take-off are not one timestamp.
- Fit the board as a rigid object from known 3D landmarks across both views. Use all available landmarks rather than only a bounding box. Inspect edge-on frames, occlusion and full-turn continuity manually. Jointly triangulated two-view data is preferable to an ambiguous single-plane PnP solution.
- Fit each shoe's position/orientation from at least three non-collinear visible landmarks, with ankle context and fixed shoe geometry. Report a shoe-frame landmark definition and the transform to the rendered sole origin. Do not mistake an anatomical ankle joint for sole contact.
- Annotate contact as a separate label: visible contact, visibly separated, or indeterminate/occluded. Video can establish apparent contact; it does not directly measure force. First touch and sustained catch may differ.
- Fit smooth trajectories within phases, preserving velocity changes at contacts. Retain raw observations and uncertainty. Quantify reprojection residuals and sensitivity to clicking/synchronization; do not invent a millimeter accuracy claim from image resolution alone.

### Day 3: retarget, inspect, and optionally use the RTX 3060

- Convert every trial to a documented world frame and a documented board frame. Keep regular/goofy and BS/FS labels explicit. For separated feet store world transforms; for contacts store both world pose and board-local contact coordinates.
- Interpolate orientations with rotation-aware methods and preserve turn counts. Derive angular velocity from rotation differences over physical time, not from wrapped Euler-angle subtraction. For free rigid-body flight use angular momentum and inertia consistently; torque-free motion does not generally mean every Euler angle advances linearly. A catch is an external interaction.
- Reproject the reconstructed board and shoe landmarks onto both original videos. Check contact gaps, penetrations, top/bottom identity and event timing. Then compare ordinary-speed and slow-motion playback with the performer. A reconstruction can look smooth while being wrong.
- Optional research pass: ExMR on a short static-camera segment if the card is the **12 GB** RTX 3060 and license terms fit the use. Upstream documents around 8 GB on a different GPU; this is a feasibility inference, not a tested local result. Use WSL2/Linux upstream, cap setup to a few hours, and keep manual capture as the deliverable if access/build fails. The 6 GB variant needs another approach or documented low-memory support.
- Feed body-motion models at their expected physical cadence with an explicit resampling map, commonly a 30 fps analysis stream, while keeping the 240 fps originals for events. Do not feed an edited 1,000 fps slow-motion playback as ordinary human speed and trust a learned dynamics prior. Interpolated pose frames add no new evidence about fast flick/catch events.
- For a product intended for commercial distribution, obtain appropriate model permission or use a properly licensed alternative. The manually digitized, owner-controlled data path avoids making a restricted model the production dependency. This is why it ranks first.

**Realistic budget:** in a few days, a carefully checked set of representative trials and event timings is feasible if rider/cameras are already available. A fully validated population dataset for ten tricks, all variants and all shoes is not. Prioritize three complete trajectory exemplars and event annotations for the rest, then expand systematically. Do not present a single skilled rider's motion as the one correct technique.

### Small physical tests worth doing alongside capture

Weigh the complete and each component on a scale. Identify the board COM and use a carefully configured bifilar/trifilar or physical-pendulum experiment to measure the inertias that matter, accounting for suspension geometry and any fixture inertia. Use a weighted shoe pull/incline test on the actual grip for static friction, with dynamic tests separated. For restitution, record a controlled wheel or complete-board drop on the actual surface, documenting orientation and avoiding conflating rotational, elastic and translational energy. A free-body formula such as `e = sqrt(reboundHeight/dropHeight)` only applies when its simple vertical-drop assumptions hold; a freely rotating complete board may not satisfy them.

## 10. What I could not find or verify

- A public measured dataset with synchronized 6-DoF board pose, both shoe orientations/contact patches, and original time across all ten requested tricks.
- Trustworthy recent full-size athlete values for flick delay, individual shoe release/catch times, universal catch order, foot clearance, or horizontal travel for each trick.
- A measured population kickflip flip rate in rev/s, or full angular-velocity curves for heelflip, varial flip, hardflip, tre flip, 360 shove-it and double kickflip. The 2026 miniature-board study does not resolve this.
- A reliable, transferable peak-flight knee-flexion target. Existing angle extrema and coordinate conventions need checking against raw data.
- A publicly released Olympic/JISS/World Skate/USA Skateboarding trajectory package suitable for direct use, despite institutional motion-analysis capabilities and recent Olympic-related research.
- Proof that Motion-X, HumanML3D, AMASS or BEDLAM contains a usable named-trick subset with tracked board contact. Some contain related action labels or shoe-aware training data; neither fact establishes the required measurements.
- Matching modern street-wheel/concrete friction and restitution measurements, or dynamic suede/rubber sidewall/grip coefficients for the flick. Available adjacent values concern different materials, surfaces or modeled assumptions.
- New numerical tail-strike impulse/contact-duration data that separates board-ground impact from rider ground reaction force.
- A controlled 2024-2026 perceptual study defining how much shoe, catch or board-rotation error skateboard viewers detect. General animation contact evidence and developer accounts are useful design precedent only.
- Sample asset files, all-ten-trick coverage, raw marker accuracy, or a confirmed product license for the commercial synchronized mocap pack. No asset was purchased.
- Actual local RTX 3060 inference runtime or reconstructed reference trajectories. This task performed source research and report writing only; no model was installed, no video was downloaded, and no project file was edited.
