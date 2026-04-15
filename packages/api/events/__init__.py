"""Ravenhill Native Events (RNE) — universal event format for all ingestion.

Per blueprint §2.1, every signal from every platform is normalized to an RNE
before it enters the rest of the system. Trust Envelope is attached at ingestion
and can only be narrowed downstream, never widened (§2.3 rules 1-5).
"""
