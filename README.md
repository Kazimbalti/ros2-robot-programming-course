# ROS and Robot Programming

**Live site:** https://kazimbalti.github.io/ros2-robot-programming-course/

A complete, free, 14-lecture hands-on Robotics and ROS 2 Humble course built around the
**AgileX LIMO** robot — from a blank laptop through VMware/Ubuntu/ROS 2 install, URDF, TF2,
Gazebo, sensors, computer vision, EKF/AMCL localization, SLAM and Nav2, a real-hardware
deep-dive on LIMO, and finally building your own ROS 2 robot from a bare motor and an empty
microSD card.

Built and taught by **Dr. Muhammad Kazim**, Assistant Professor, Department of Intelligent
Systems, University of Lahore, Pakistan.

## Structure

- `index.html` — course home page (curriculum, stats, per-student lecture progress tracker)
- `01-...html` … `14-...html` — the 14 lectures, in order
- `syllabus.html`, `schedule.html`, `assignments.html`, `midterm.html`, `final.html`, `attendance.html` — course-admin pages
- `book.css` / `projector.css` — shared styling (course-admin pages + a high-legibility projector override used on every page)
- `annotate.js` — in-browser pen/whiteboard annotation tool available on every page
- `images/` — figures, diagrams, and screenshots used throughout the lectures

## Running locally

This is a static site — no build step. Serve the folder with any static file server, e.g.:

```bash
python -m http.server 8000
```

then open `http://localhost:8000/index.html`.
