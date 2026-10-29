# SourceCard anatomy (data-flow audit)

_As of 2026-10-29 (HEAD 1485438). A component map of the Intelligence SourceCard:
every editable field -> its control -> handler -> writer -> cloud column/path, plus
which fields GATE (feed canRoute) vs are provenance-only. Point-in-time; regenerate
from code if the card changes._

```mermaid
flowchart TD
  subgraph ZA["Zone A - Assessment and Routing"]
    C["confidence pill"] --> CW["updateConfidence -> confidence_override=1"]
    R["relevance pill (R2: numeric 1-10)"] --> RW["setHumanRelevance -> analysis_json.human.relevance"]
    I["incident Yes/No"] --> IW["setIncidentFlag -> analysis_json.human.incident"]
    SP["CS-section chips (display-only)"]
    P["project selector"] --> PW["setProject -> project_board_id"]
  end
  subgraph ZB["Zone B - Geography"]
    G["GeographyChips: countries + REGIONAL/GLOBAL + 6 region tokens; + region picker; gate chip"] --> GW1["updateCountries -> subject/mentioned/sub_geographies + geography_confirmed=1"]
    G --> GW2["setGeographyOrigins -> human.geography_origins (per-chip origin)"]
    G --> GW3["setGateGeoDismissed -> human.gate_geo_dismissed"]
  end
  subgraph ZC["Zone C - Engaged Entities"]
    A["ActorChips (per-chip origin)"] --> AW["updateActors -> actors JSON"]
  end
  subgraph ZD["Zone D - Topics"]
    T["TagPicker"] --> TW["setArticleTags -> thematic_tags"]
  end
  CW --> GATE
  IW --> GATE
  GW1 --> GATE
  TW --> GATE
  GATE{"canRoute - six checks AND: content, aiAnalyzed, tags>=1, confidenceOverride, geographyConfirmed && subject>0, incident.human != null"}
  PROV["provenance-only, never gate: geography_origins, actor origin, human.relevance, proposed_sections, mentioned, sub_geographies, snippet"]
```

Loose ends found by the audit (banked, see HANDOFF): CS-section chips are display-only
(setRoutingConfirmed writer exists but unwired); the card snippet is the article's own
(not AI-generated); readCloudAnalysis silent-flatten risk across all .human writers.
