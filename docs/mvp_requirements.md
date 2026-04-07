# RavenHill — MVP Requirements Document

**Design Partner Demo | Version 1.2 | March 2026**

*INTERNAL — CO-FOUNDER USE ONLY*

This document defines exactly what we build, what we defer, and why.

---

## 1. Purpose and Scope

### 1.1 What This MVP Is

This MVP is a design partner demo. Its purpose is to sit across from one specific person — the COO of a marketplace company approaching 100 employees — and prove that RavenHill's core thesis works. That thesis: AI agents that autonomously discover each other and coordinate across an organization eliminate the information relay layer that currently runs on meetings, Slack threads, and ask chains.

The demo must make the COO say: "I want to build this with you." Not "I want to buy this." The goal is a design partner commitment: their time, their feedback, access to their real workflows, and permission to iterate inside their organization.

### 1.2 What This MVP Is Not

- It is not a sales demo. There is no pricing, no contract, no onboarding flow.
- It is not a product. There is no admin dashboard, no settings page, no user management.
- It is not a generic demo. It is built around a specific target's organizational reality.
- It is not a chatbot. If it feels like a chatbot, we have failed.

### 1.3 Success Criteria

The demo succeeds if the following things happen in this order:

1. **The COO feels the magic.** They see the system do something they didn't expect — discover information they didn't know to ask for, route around a bottleneck they didn't know existed, or synthesize context from multiple parts of the org without being told who to ask.
2. **The COO maps it to their own pain.** After seeing the demo, they start describing their own internal workflows, bottlenecks, and meetings that could disappear. This is the conversion signal.
3. **The COO agrees to a design partnership.** They commit to letting us shadow a real workflow in their org, build RavenHill around it, and iterate with their team.

---

## 2. The Demo Experience

### 2.1 Setup and Environment

The demo environment consists of one visible screen and a behind-the-scenes system.

**What the COO Sees:** A single, clean chat interface. Nothing else. No sidebar, no tabs, no navigation, no branding beyond a minimal RavenHill logo. The interface is their agent. They type naturally, and the agent responds.

Behind the scenes, three other agents are running, each representing a different employee in a simulated company. The COO does not see these agents. They only see the results of their agent's interactions with them.

> **Design Principle:** *The interface should feel like talking to someone who knows your entire company. Not like using a tool. The absence of UI chrome is the feature — it signals that the agent handles the complexity, not the user.*

**The Simulated Organization:** Pre-seed four agents representing a simplified version of the target company's actual org structure:

| Agent | Role | Knowledge Domain | Example Data |
|-------|------|-----------------|--------------|
| Agent 0 (COO) | The Demoee | Company-wide visibility, strategic priorities, KPIs | Q2 goals, board meeting dates, hiring targets |
| Agent 1 | Product Lead | Product roadmap, feature status, design decisions, sprint progress | Marketplace redesign status, blockers, designer assignments, launch criteria |
| Agent 2 | Engineering Lead | Technical architecture, API dependencies, deployment timeline, team capacity | API vendor status, sprint velocity, tech debt items, infrastructure costs |
| Agent 3 | Operations Manager | Seller onboarding, customer support metrics, vendor relationships, process documentation | Onboarding funnel data, support ticket trends, vendor contract dates, SOPs |

> **Critical Implementation Note:** The dummy data must be based on the target company's real structure. Before the demo, research or ask the COO about their actual team roles, current projects, and known pain points. Populate the agents with realistic analogs. The data doesn't need to be accurate — it needs to be recognizable. The COO should look at the demo and think "that sounds like my company" without us claiming it is.

### 2.2 The Demo Flow

The demo has three moments. Each one escalates what the system demonstrates. The entire sequence should take 60-90 seconds of live interaction, plus time for the COO to ask questions between moments.

#### Moment 1: Discovery Without Direction

**What the COO does:** Types a natural question. Example: "Are we on track for the marketplace redesign?"

**What they do NOT do:** Select a person, pick a channel, specify a department, or indicate who might know. They just ask.

**What happens behind the scenes:**

1. **Query analysis.** The COO's agent parses the question and identifies the domain: this is a product/engineering question with potential ops implications.
2. **Discovery.** The agent queries the topic map (Section 3.3) for agents registered under relevant topics. It identifies Agent 1 (Product Lead) and Agent 2 (Engineering Lead) as relevant.
3. **Multi-agent query.** The COO's agent sends a scoped query to both agents simultaneously. Each agent responds based only on information its human has made available.
4. **Synthesis.** The COO's agent combines both responses into a single, coherent natural language answer.

**What the COO sees:** A single response, delivered in seconds, that synthesizes information from two different parts of the organization. Something like:

> *"The marketplace redesign is partially on track. Product: designs are approved and the feature spec is finalized, but development hasn't started yet. Engineering: the team is blocked on an API dependency from a third-party vendor — the docs were expected last Thursday and haven't arrived. Current estimate is two weeks from when the dependency is resolved. Want me to find out more about the API blocker?"*

**Why this moment matters:** The COO didn't tell the system who to ask. The system figured it out. This is the first moment that separates RavenHill from a chatbot or a search tool. The COO sees organizational awareness, not a lookup.

#### Moment 2: The Chain

**What the COO does:** Follows up on something in the response. Example: "Yes, find out what's going on with the API dependency."

**What happens behind the scenes:**

5. **Follow-up routing.** The COO's agent identifies that the API dependency was mentioned by Agent 2 (Engineering Lead). It sends a follow-up query to Agent 2 asking for specifics.
6. **Second-hop discovery.** Agent 2 has a piece of context: "API docs are expected from vendor. Contact: ops team manages vendor relationship." Agent 2 does not have the current status. It indicates that Agent 3 (Operations Manager) may have more information.
7. **Chained query.** The COO's agent automatically queries Agent 3 (Operations Manager) about the vendor status.
8. **Agent 3 responds.** "Vendor confirmed API docs will be delivered Thursday. New contact: [name]. Follow-up scheduled."
9. **Synthesis.** The COO's agent combines the engineering context and the ops update into one response.

**What the COO sees:**

> *"The API dependency is with [Vendor Name]. Engineering has been waiting on their documentation since last Thursday. I checked with the ops team — the vendor confirmed the docs will be delivered this Thursday. Ops has a follow-up call scheduled. Once the docs arrive, engineering estimates they can start development the following Monday. Want me to notify the product lead about the updated timeline?"*

**Why this moment matters:** The system followed a thread across three agents without being told to. The COO asked one follow-up question and got an answer that required navigating from engineering to ops — a path the COO may not have known to take. This is the moment that demonstrates organizational intelligence, not just information retrieval.

#### Moment 3: The Approval

**What the COO does:** Takes action based on what they learned. Example: "Yes, let the product lead know the timeline is pushed. And ask the ops team to share the vendor contract so engineering can review the API scope."

**What happens behind the scenes:**

10. **Notification.** The COO's agent sends a message to Agent 1 (Product Lead) with the timeline update. This is informational — no approval required. Agent 1 acknowledges receipt.
11. **Document request.** The COO's agent sends a document-sharing request to Agent 3 (Operations Manager) for the vendor contract.
12. **Approval prompt.** On a second screen (visible to the audience), Agent 3 shows a notification:

    > **Approval Pop-Up**
    > "[COO Name] is requesting the [Vendor Name] contract be shared with the Engineering team."
    >
    > **Approve | Deny | Ask for Context**

13. **Resolution.** One tap to approve. The document reference is shared. No email, no Slack, no meeting.

**What the COO sees:** Confirmation that the product lead has been updated and that the vendor contract has been shared with engineering after ops approved.

**Why this moment matters:** This is the human-in-the-loop moment. It proves the system doesn't act without permission. The ops manager's agent didn't auto-share a potentially sensitive document — it asked first. This is the trust moment. It shows the COO that deploying this to real employees is safe.

> **After the Demo — The Transition**
>
> **Do not pitch after the demo. Ask questions.** The demo is the setup. The payoff is getting the COO to describe their own version of what they just saw.
>
> *"Where in your company does something like this happen? Where is someone right now waiting on information from another team?"*
>
> Then shut up and listen. If the COO starts describing their own workflows, the demo worked. The next question is: "Can we build this around one of those workflows with your team?"

---

## 3. System Architecture

This section defines every component that must be built, what it does, and how it works. No component is optional. If it's listed here, it's required for the demo.

### 3.1 Agent

An agent is a persistent, stateful entity that represents one employee in the organization. For the MVP, there are exactly four agents.

**Agent State:**

| Field | Type | Description |
|-------|------|-------------|
| agent_id | string (UUID) | Unique identifier for the agent. |
| role_name | string | Human-readable role title. Example: "Product Lead" |
| role_description | string | One paragraph describing this role's responsibilities and scope. Used by the LLM to determine whether a query is relevant. |
| knowledge_base | array of KnowledgeEntry | Structured information this agent "knows." See Section 3.2. |
| topic_keys | array of string | Topic keys this agent is registered under in the topic map. See Section 3.3. Example: ["marketplace_redesign", "product_roadmap", "feature_prioritization"] |
| documents | array of DocumentRef | References to documents this agent can share. Each has a name, description, and a sensitivity flag (requires_approval: boolean). |
| trust_level | enum: auto \| notify \| approve | Default action threshold. 'auto' = agent responds without human input. 'notify' = agent responds and notifies human. 'approve' = agent waits for human approval before responding. For MVP, default all agents to 'auto' for queries and 'approve' for document sharing. |
| activity_log | array of LogEntry | Chronological log of every query received, response sent, and action taken. Visible to the agent's human. |

### 3.2 Knowledge Base

Each agent's knowledge base is a structured collection of information that the agent can draw from when responding to queries. This is the core data layer for the MVP.

**KnowledgeEntry Schema:**

| Field | Type | Description |
|-------|------|-------------|
| topic | string | Short label. Example: "marketplace_redesign" |
| category | enum | One of: project_status, blocker, dependency, metric, document_ref, process, contact, timeline |
| content | string | The actual information. Natural language, 1-3 sentences. |
| last_updated | datetime | When this information was last refreshed. Used to indicate staleness in synthesized answers. |
| visibility | enum: public \| team \| private | Who can see this. 'public' = any agent can query it. 'team' = only agents in the same department. 'private' = only the owning agent. For MVP, default most entries to 'public.' |
| references_agent | string (agent_id) \| null | If this entry points to another agent as a source or contact, include their agent_id. This enables second-hop discovery. |

**Knowledge Base Sizing:** Each agent should have 8-15 knowledge entries. The entries should cover:

- 2-3 project statuses (what's on track, what's behind, what's blocked)
- 1-2 blockers or dependencies (critical: at least one must reference another agent's domain, enabling the chain in Moment 2)
- 1-2 metrics or KPIs (seller conversion rate, sprint velocity, support ticket volume)
- 1-2 document references (the vendor contract, the product spec, the onboarding playbook)
- 1-2 process or SOP entries (how vendor onboarding works, what the approval flow looks like)
- 1 contact/relationship entry (who manages the vendor relationship, who the designer reports to)

> **The Chain Must Be Engineered**
>
> The second-hop query in Moment 2 only works if the knowledge base is designed with cross-references. Specifically: Agent 2 (Engineering) must have a knowledge entry about the API blocker that includes a references_agent field pointing to Agent 3 (Operations). Without this, the chain breaks and Moment 2 fails.
>
> This is not cheating. This is modeling how real organizations work — engineers know that ops manages vendor relationships. The data reflects real organizational structure.

### 3.3 Discovery Layer (Topic Map)

The discovery layer is the most critical component of the MVP. It is the mechanism by which one agent finds another agent without being told who to contact. The implementation uses a nested hash map — a simple, fast data structure that maps topics to functional areas to agents.

**Data Structure:** The topic map is a two-level nested hash map. The first level key is a topic (a project, domain, or area of responsibility). The second level key is a functional area (the type of role that has relevant information). The value is the agent_id of the agent that owns that intersection.

```
{
  "marketplace_redesign": { "product": agent_1, "engineering": agent_2, "operations": agent_3 },
  "vendor_management": { "operations": agent_3 },
  "q2_planning": { "product": agent_1, "finance": agent_3, "executive": agent_0 },
  "api_integrations": { "engineering": agent_2 },
  "seller_onboarding": { "operations": agent_3, "product": agent_1 },
  "sprint_progress": { "engineering": agent_2, "product": agent_1 }
}
```

**How Discovery Works:**

1. **Key extraction.** When the COO asks a question, the COO's agent makes an LLM call to identify which topic keys are relevant. Critically, this is a closed-set selection, not open-ended generation. The prompt provides the full list of available keys and the LLM picks from that list.
2. **Hash map lookup.** For each matched key, the system looks up all agents registered under that topic. This is an O(1) lookup per key — effectively instant.
3. **Agent deduplication and ranking.** If the same agent appears under multiple matched keys, it gets a higher relevance score. Agents that appear under more matched topics are more likely to have relevant information. The top 2-3 unique agents are selected for querying.

**Key Extraction Prompt Template:**

> You are a routing system for an organization. Given a user's question, select which topics are relevant from the list below. Return ONLY keys from this list. Do not invent new keys.
>
> Available topics: {list_all_top_level_keys}
>
> User question: "{user_message}"
>
> Conversation history: {last_3_messages}
>
> Return format: ["key_1", "key_2"]
>
> Rules: Select 1-3 keys maximum. Only select keys that are directly relevant. If no keys match, return an empty array.

> **Why Closed-Set Selection Matters:** The LLM selects from existing keys; it does not generate new ones. This is the key architectural decision. Open-ended key generation would produce keys that don't exist in the map, causing silent failures. By presenting all available keys and asking the LLM to select, you guarantee that every match maps to a real agent.

**Handling Edge Cases:**

- **No keys match:** The LLM returns an empty array. The COO's agent responds: "I wasn't able to find anyone in the organization with information on that topic. Can you rephrase or give me more context?"
- **Ambiguous match:** The LLM selects multiple keys. All mapped agents are queried. The synthesis step handles relevance filtering — if an agent's response isn't relevant, the synthesis LLM will naturally exclude it.
- **Synonym problem:** The COO says "seller experience" but the key is "seller_onboarding." Add common synonyms as additional top-level keys that point to the same agents. The map is cheap — adding redundant keys costs nothing and dramatically improves match rates.

> **Build Synonym Keys Proactively:** After populating the topic map, brainstorm 2-3 alternative phrasings for each key. "marketplace_redesign" should also have "platform_redesign" and "marketplace_update." "seller_onboarding" should also have "seller_experience" and "new_seller_setup." This takes 30 minutes and prevents the most common demo failure: the COO uses slightly different words than you expected.

**Topic Map Sizing:** The topic map should have 10-20 top-level keys with synonym variants = ~30-50 total key-to-agent mappings. Each key should map to 1-3 agents. The total map should have approximately 30-50 entries.

### 3.4 Query Processing Pipeline

This is the step-by-step process that runs every time the COO types a message. Every step here is a requirement.

**Step 1: Intent Classification**

The COO's agent receives the message and makes an LLM call to classify the intent:

- **information_query:** The user is asking for information. Triggers discovery and multi-agent query.
- **follow_up:** The user is asking a follow-up to a previous response. The agent has conversation context and may already know which agent(s) to re-query.
- **action_request:** The user is asking the agent to do something (notify someone, share a document, set a reminder). Triggers the action pipeline (Section 3.5).
- **clarification:** The user's intent is unclear. The agent asks a clarifying question before proceeding.

**Step 2: Key Extraction**

For information_query and follow_up intents, the agent identifies relevant topic keys from the topic map. This is an LLM call against the closed set of available keys (see Section 3.3 for the prompt template). The LLM selects 1-3 keys from the available topics.

**Step 3: Agent Discovery**

The extracted keys are looked up in the topic map. The matching process:

1. **Hash map lookup.** For each selected key, retrieve all agents mapped under that topic. This is an O(1) lookup — instant.
2. **Deduplication and scoring.** If an agent appears under multiple matched keys, it receives a higher relevance score. An agent mapped to 2 of 3 matched topics is more relevant than one mapped to 1 of 3.
3. **Selection.** The top 2-3 unique agents (by relevance score) are selected for querying. If only 1 agent matches, query only that agent. If 0 agents match (no keys selected or empty lookup), the COO's agent responds: "I wasn't able to find anyone in the organization with that information. Can you give me more context?"

**Step 4: Multi-Agent Query**

The COO's agent sends a scoped query to each selected agent. The query includes:

- **The original question** (or a refined version based on domain extraction)
- **The requesting agent's role** (so the responding agent can calibrate the level of detail)
- **A scope constraint:** "Respond only with information you have available. Do not speculate. If you don't have the answer, say so and indicate who might."

Each responding agent processes the query against its own knowledge base. This is an LLM call with the agent's knowledge entries as context.

> **Agent Response Prompt Template:**
>
> You are an AI agent representing {role_name}. Your knowledge:
>
> {knowledge_base_entries}
>
> A query has come from {requesting_agent_role}: "{query}"
>
> Respond with relevant information from your knowledge base. If you don't have the information, say so. If another person/team might know, indicate who. Be concise and factual.

**Step 5: Response Synthesis**

The COO's agent collects all responses and synthesizes them into a single natural language answer. This is the final LLM call:

> **Synthesis Prompt Template:**
>
> You are the AI agent for the COO. You queried the following agents and received these responses:
>
> Agent 1 ({role_name_1}): {response_1}
>
> Agent 2 ({role_name_2}): {response_2}
>
> Synthesize these into a single, clear response for the COO. Organize by topic, not by source. Highlight blockers, risks, and action items. If any agent indicated that another team might have more information, mention this and offer to follow up. Keep it under 150 words.

**Step 6: Second-Hop (Conditional)**

If any responding agent in Step 4 included a references_agent pointer in their response (e.g., "ops manages the vendor relationship"), the synthesis step should surface this as a follow-up offer: "Want me to find out more about the vendor status?"

If the COO says yes, the query pipeline restarts from Step 2, targeting the referenced agent directly (bypassing the topic map lookup since the target is already known). The response is synthesized with the original context to create a comprehensive answer.

### 3.5 Action Pipeline

When the COO requests an action (notification, document sharing), the following process runs:

**Notification (Informational):** The COO's agent sends a message to the target agent with the information. The target agent logs the notification and acknowledges receipt. No approval required.

The COO sees: "[Product Lead] has been notified about the updated timeline."

**Document Sharing (Approval Required):**

1. **Request.** The COO's agent sends a document-sharing request to the target agent, specifying which document is being requested.
2. **Approval prompt.** The target agent's interface shows a pop-up notification with: the requester's name and role, the document being requested, and three options: Approve, Deny, Ask for Context.
3. **Resolution.** If approved, the document reference is shared and the COO's agent confirms. If denied, the COO's agent reports the denial. If "ask for context," the COO's agent receives a follow-up question and relays it.

> **Approval UI Requirements:** The approval pop-up must be clean, simple, and feel trustworthy. It is the single UI element a non-demoee sees during the demo. It must communicate:
> - Who is asking (name + role)
> - What they want (document name + brief description)
> - Three clear options (Approve / Deny / Ask for Context)
>
> No other UI. No navigation, no settings, no chrome. Just the notification.

---

## 4. Data Requirements

Every piece of data in the system must be manually authored before the demo. Nothing is auto-generated, nothing is scraped, nothing is inferred. This section defines exactly what data must be prepared.

### 4.1 Per-Agent Data Checklist

| Data | Count | Notes |
|------|-------|-------|
| Role name + description | 1 | Must feel like a real job description, not a caricature |
| Knowledge base entries | 8-15 | See Section 3.2 for schema and distribution |
| Topic map keys | 5-10 per agent | Include 2-3 synonym keys per topic |
| Documents | 1-3 | At least one must have requires_approval: true |
| Cross-references | 1-2 | At least one knowledge entry must reference another agent via references_agent |

### 4.2 Total Data Budget

- **4 agents x ~12 knowledge entries = ~48 entries total.** Each entry is 1-3 sentences. This is approximately 3,000-5,000 words of authored content.
- **10-20 top-level topic map keys with synonym variants = ~30-50 total key-to-agent mappings.** Each key is a short snake_case string. Synonym keys are cheap — add them generously.
- **~6-10 document references total.** Name + description + sensitivity flag. No actual files needed — just metadata.
- **Estimated data authoring time: 4-6 hours.** This is not trivial. It is some of the most important work in the MVP. Bad data = bad demo.

> **Data Authoring Responsibility:** Max should author the data, not the engineers. The data needs to feel like a real company. It needs to reference plausible projects, real-sounding vendor names, realistic timelines, and recognizable org dynamics. The engineers don't know the target company. Max does. The engineers build the system; Max makes it feel real.

---

## 5. Technical Requirements

### 5.1 LLM Integration

- **Model:** Use the best available model for the demo. Claude or GPT-4 class. Speed matters — the synthesis response should arrive in under 5 seconds.
- **API calls per query:** A single user question triggers approximately 3-5 LLM calls: (1) intent classification, (2) key extraction from closed set, (3) one per responding agent (1-2), (4) synthesis. The topic map lookup itself is O(1) and adds no latency. A follow-up chain adds 2-3 more LLM calls. Budget for up to 8 calls per user interaction.
- **Prompt templates:** All prompt templates (Section 3.4) must be externalized, not hardcoded. They will be iterated on heavily.
- **Context window:** Each agent's knowledge base must fit comfortably in a single context window. At 8-15 entries of 1-3 sentences each, this is well within limits.

### 5.2 Latency Targets

| Interaction | Target | Maximum |
|-------------|--------|---------|
| Single-agent response (Moment 1) | 3 seconds | 5 seconds |
| Multi-agent synthesis (Moment 1) | 5 seconds | 8 seconds |
| Chained query (Moment 2) | 5 seconds | 10 seconds |
| Approval notification delivery | < 1 second | 2 seconds |
| Approval resolution (after tap) | < 1 second | 1 second |

**Use streaming for the synthesis response.** The COO should see the answer being typed out, not wait for a blank screen and then a wall of text. Streaming makes 5 seconds feel fast. A loading spinner makes 3 seconds feel slow.

### 5.3 Conversation State

- **Session-based.** The COO's agent maintains a conversation history for the duration of the demo session. This enables follow-up questions and contextual chaining.
- **No persistence required.** The demo resets between sessions. No database, no user accounts, no state management beyond the active session.
- **Conversation context window:** The agent's system prompt + knowledge base + last 10 messages. This should be sufficient for the demo flow.

### 5.4 Infrastructure

- **Hosting:** Cloud-hosted. Must be accessible via a URL so the demo can run on any laptop with an internet connection. No local setup, no dependencies, no "let me just install this first."
- **Two screens:** The demo requires at minimum two browser tabs or two devices: one for the COO's agent (the primary demo surface), and one for the approval notification (Moment 3). The second screen can be a phone, a tablet, or a second browser window.
- **No authentication for demo.** Pre-authenticated sessions. The COO clicks a link and their agent is ready. The approval screen is on a separate link. Zero friction.

---

## 6. Interface Requirements

### 6.1 COO Agent Interface (Primary Screen)

- **Layout:** Full-screen chat. Message input at the bottom. Conversation history scrolling above. No sidebar, no header nav, no settings icon.
- **Branding:** Minimal RavenHill logo in the top-left corner. Small, understated. No tagline.
- **Messages:** User messages on the right (or clearly distinguished). Agent messages on the left. Agent messages should use a clean, readable font. No avatars, no timestamps, no metadata visible to the user.
- **Typing indicator:** When the agent is processing (making LLM calls, querying other agents), show a subtle typing indicator. Not a spinner — a pulsing dot or similar. This signals that the agent is working, not frozen.
- **Source attribution (subtle):** At the bottom of synthesized responses, a small, muted line: "Sources: Product, Engineering" or similar. This lets the COO know the system talked to multiple parts of the org without being intrusive. This is optional but recommended — it reinforces the multi-agent nature without requiring explanation.

### 6.2 Approval Interface (Secondary Screen)

- **Layout:** A centered notification card on a clean background. Nothing else.
- **Card content:** Requester name and role. Document name and 1-line description. Three buttons: Approve (primary, green), Deny (secondary, red), Ask for Context (tertiary, gray).
- **After action:** Confirmation message: "Document shared with [requester]" or "Request denied" or text input field for context question.
- **Idle state:** Before the approval request arrives, this screen should show a subtle "Waiting for requests..." message. Not blank — that looks like a broken page.

> **No Other UI:** There is no admin panel. There is no settings page. There is no user profile. There are no tabs. The MVP has exactly two interfaces: the chat window and the approval card. Everything else is a distraction. If your co-founders have already built tabs for activity, security, and settings, those should be hidden for the demo. They can exist in the codebase but they must not be visible.

---

## 7. Explicitly Not in Scope

These items are important for the eventual product. They are not in this MVP. Building any of them before the design partner demo is a misallocation of engineering time.

| Feature | Why Not Now |
|---------|------------|
| User authentication / accounts | The demo uses pre-authenticated sessions. Auth is infrastructure, not product. |
| Admin dashboard | No buyer is evaluating admin features at this stage. They're evaluating the core thesis. |
| Settings / configuration UI | Settings imply a deployed product. This is a demo. |
| Activity log UI | The log should exist in the backend for debugging, but the COO doesn't need to see it. |
| SaaS integrations | The MVP uses pre-loaded knowledge bases, not live data from Slack/Notion/etc. Integrations come after the design partner says "yes." |
| Voice interface | Chat-first. Voice adds complexity with no incremental proof of thesis. |
| Automatic topic inference | Topic map keys are manually authored. Automatic inference from agent activity is a post-MVP optimization. |
| Org intelligence queries | VP-level cross-org synthesis ("what's blocking the company?") is the next capability after MVP, not part of it. |
| Mobile app | Browser-based. Responsive is fine. Native mobile is not. |
| Payments / agent transactions | Foundry integration is a future layer. |
| Onboarding flow | There is no self-serve onboarding. The demo is set up by the team. |
| Multi-tenant architecture | One simulated org. No tenant isolation needed. |
| Data persistence | Session-based. No database required beyond in-memory state. |
| Audit logs UI | Backend logging only. No compliance UI. |

---

## 8. Engineering Work Breakdown

This is an estimated breakdown. Adjust based on your stack and experience. The numbers assume two engineers working in parallel.

### 8.1 Component Priority and Estimates

| Component | Priority | Estimate | Dependencies |
|-----------|----------|----------|-------------|
| Topic map + key extraction | P0 | 1-2 days | LLM API access |
| Agent data model + knowledge base | P0 | 0.5-1 day | None |
| Query processing pipeline | P0 | 2-3 days | Topic map, agent model |
| Response synthesis | P0 | 1-2 days | Query pipeline |
| Chat UI (COO screen) | P0 | 1 day | Query pipeline |
| Approval notification UI | P0 | 0.5 day | Action pipeline |
| Action pipeline (notify + share) | P1 | 1 day | Agent model |
| Second-hop chaining | P1 | 1-2 days | Query pipeline, topic map |
| Streaming responses | P1 | 0.5 day | Chat UI |
| Demo data authoring | P1 | 4-6 hours | Agent model finalized |
| Prompt tuning + testing | P0 | 3-4 days | Full pipeline working |
| Integration testing + rehearsal | P0 | 3-5 days | All above |

> **Estimates Assume Claude Code:** These estimates assume both engineers are using Claude Code (or equivalent AI coding tools) throughout development. Scaffolding, boilerplate, API wiring, UI components, and data model setup compress significantly with AI-assisted coding. The time saved is reallocated to the work that doesn't compress: prompt tuning, testing with varied phrasings, rehearsing the demo with a non-cofounder, and fixing the failures that only surface during live testing.
>
> **What compresses:** Data structures, API endpoints, WebSocket setup, chat UI, approval card UI, LLM call orchestration, test harness scaffolding. These are well-defined, pattern-heavy engineering tasks.
>
> **What does not compress:** Key extraction prompt tuning, synthesis prompt tuning, agent response prompt tuning, testing the system with varied phrasings, rehearsing the demo with a non-cofounder, and fixing the failures that only surface during live testing. This is human judgment work. AI tools can help write the test framework, but they cannot tell you whether the synthesized response feels right.

**Total estimated build time: 2-2.5 weeks with two engineers using Claude Code.** This assumes the engineers are not also attending classes full-time during this period. If they are, add 50-100%. The time saved on scaffolding should be reinvested into more testing and rehearsal, not used to ship earlier.

### 8.2 Suggested Build Order

1. **Week 1 (Build):** Agent data model, topic map, key extraction, query processing pipeline, response synthesis, and both UI surfaces (chat + approval card). With Claude Code, the scaffolding for all of these can be stood up in the first 2-3 days. Spend the rest of the week getting a rough end-to-end flow working: COO asks a question -> key extraction -> topic map lookup -> agent query -> synthesis -> response displayed. It will be ugly. That's fine.

2. **Week 2 (Polish + Connect):** Second-hop chaining, action pipeline (notifications + approval flow), streaming responses. Connect everything. Run the full Moment 1 -> 2 -> 3 flow. Begin prompt tuning: test the key extraction prompt with 20+ varied phrasings and add synonym keys for every failure. Tune synthesis prompts for coherence and conciseness. Max authors the demo data in parallel.

3. **Week 3 (Test + Rehearse):** This is the most important week. Run the demo at least 10 times end-to-end. Have someone unfamiliar with the product play the COO and ask unexpected questions. Log every failure. Fix discovery misses by adding synonym keys. Fix hallucinations by tightening agent response prompts. Fix incoherent synthesis by iterating on the synthesis prompt. Rehearse the post-demo transition to discovery questions. Do not skip this week. The quality of the demo is determined here, not in Week 1.

---

## 9. Risk Register

*(Content from remaining pages of the PDF would go here if available.)*
