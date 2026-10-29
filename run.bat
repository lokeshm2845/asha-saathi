@echo off
REM Starts the ASHA Saathi PHC server on http://localhost:8000
cd /d "%~dp0"
python -m pip install -q -r requirements.txt
echo.
echo  ASHA app:       http://localhost:8000/app/
echo  PHC dashboard:  http://localhost:8000/dashboard/
echo  (Ctrl+C to stop)
echo.
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000
