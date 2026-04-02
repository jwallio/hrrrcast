@echo off
setlocal
python "%~dp0run_hrrrcast_cycle.py" --latest --export-pages %*
