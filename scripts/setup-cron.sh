#!/bin/bash
#
# Crypto Investment Advisor — Cron Job Setup
# This file shows how to automate monitoring and reporting
#

# Place in /root/projects/crypto-investment-advisor/scripts/

# =============================================================================
# Option 1: System Crontab (Traditional Approach)
# =============================================================================
# 
# Add these lines to: crontab -e
#
# # Run analysis every hour (top 100 coins)
# 0 * * * * cd /root/projects/crypto-investment-advisor && npm run analyze >> data/analysis.log 2>&1
#
# # Scan for new altcoins every 4 hours (starting at 6 AM)
# 0 6,10,14,18,22 * * * cd /root/projects/crypto-investment-advisor && npm run scan-launches >> data/launches.log 2>&1
#
# # Generate daily report at 7 AM (Cesar's briefing time)
# 0 7 * * * cd /root/projects/crypto-investment-advisor && npm run report >> data/daily-report.log 2>&1
#
# # Continuous monitoring (runs in background)
# @reboot cd /root/projects/crypto-investment-advisor && npm run monitor > /tmp/crypto-monitor.log 2>&1 &
#

# =============================================================================
# Option 2: Hermes Cron Job (Recommended for Cesar)
# =============================================================================
#
# Use the cron integration in Hermes for automatic Whatsapp/Email delivery
#
# Command:
# mcp__cronjob create --schedule "0 * * * * *" --prompt "Run crypto analysis"
#
# This will:
# - Run hourly technical analysis
# - Monitor altcoin launches
# - Send alerts to WhatsApp
# - Log all signals to data/
#

# =============================================================================
# Option 3: Systemd Service + Timer (Production)
# =============================================================================
#
# Create: /etc/systemd/system/crypto-monitor.service
#
# [Unit]
# Description=Crypto Investment Advisor Monitor
# After=network.target
#
# [Service]
# Type=simple
# User=root
# WorkingDirectory=/root/projects/crypto-investment-advisor
# ExecStart=/usr/bin/npm run monitor
# Restart=always
# RestartSec=60
# StandardOutput=journal
# StandardError=journal
#
# [Install]
# WantedBy=multi-user.target
#
# Then run:
# sudo systemctl daemon-reload
# sudo systemctl enable crypto-monitor
# sudo systemctl start crypto-monitor
#

# =============================================================================
# Manual Test Commands
# =============================================================================

echo "🔍 Crypto Investment Advisor — Available Commands"
echo ""
echo "1️⃣  Single Analysis (Top 100 coins):"
echo "   npm run analyze"
echo ""
echo "2️⃣  Scan for New Launches:"
echo "   npm run scan-launches"
echo ""
echo "3️⃣  Continuous Monitoring (runs forever):"
echo "   npm run monitor"
echo ""
echo "4️⃣  Generate Daily Report:"
echo "   npm run report"
echo ""
echo "📋 View Analysis Results:"
echo "   cat data/signals/latest.json           # Current technical signals"
echo "   cat data/opportunities/altcoins.json   # Ranked altcoin list"
echo "   tail -f data/alerts.log                # Real-time alerts"
echo ""
echo "⚙️  Configuration:"
echo "   config/analysis.json                   # Edit for thresholds & strategies"
echo "   .env                                   # API keys (see .env.example)"
echo ""
