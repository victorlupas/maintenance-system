# maintenance-system
Final project for Atos - Manufacturing Predictive Maintenance System

Small and Medium-sized Enterprise(SME) Manufacturing Predictive Maintenance System

Context: Report shows only 17% of German manufacturers use AI, with predictive maintenance delivering 30% cost reduction

Core Requirements:
    - Build a system that ingests sensor data (temperature, vibration, pressure) from CSV/JSON files
    - Implement anomaly detection (use LLMs or classic ML)
    - Create time-series forecasting for equipment failure
    - Design alert system with configurable thresholds and email notifications
    - Generate maintenance scheduling recommendations based on predictions

# 1. Synthetic Data Generation
- Generate simple sensor synthetic data with LLM
- Create 3-5 equipment profiles
- Generate normal and failure patterns

# 2. Basic Anomaly Detection
- LLM-based pattern analysis using few-shot prompting
- Simple threshold-based rules as backup
- Return anomaly score and explanation

# 3. Simple Predictions
- LLM-based "time to failure" estimation
- Basic trend analysis
- Confidence scoring

# 4. Alert System
- Console/file logging (optional email)
- Simple threshold configuration via JSON
- Basic alert dashboard

# 5. Simple Maintenance Recommendations
- Rule-based scheduling from LLM output
- Priority ranking
- Basic cost-benefit analysis