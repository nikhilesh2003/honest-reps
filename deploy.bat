@echo off
setlocal
cd /d "%~dp0"
echo ========================================================
echo  Honest Reps — Hostinger Deployment
echo  Target: https://honestreps.ifleon.com
echo ========================================================
node scripts/deploy-node.cjs
pause
