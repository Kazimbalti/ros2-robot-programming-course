# ROS and Robot Programming

**Live site:** https://kazimbalti.github.io/ros2-robot-programming-course/

A free, hands-on Robotics and ROS 2 Humble course for students meeting ROS for the first time:
**Mission Zero** (Linux survival training), **14 lectures** in two parts, and **3 Build-Your-Own-Robot projects**.
Every lecture follows the same learning format (outcomes → warm-up → the idea in 10 minutes → step-by-step labs
with expected output → activities with hints and solutions → common errors → knowledge check → homework) and has
infographics, figures, and interactive simulators built into the page.

Built and taught by **Dr. Muhammad Kazim**, Assistant Professor, Department of Intelligent
Systems, University of Lahore, Pakistan.

## Structure

| Part | Lectures | Files |
|---|---|---|
| Part A — ROS 2 Bootcamp (turtlesim) | 1 Install · 2 Nodes · 3 Topics · 4 Services · 5 Interfaces · 6 Parameters & Launch · 7 Catch Them All | `01-…html`, `L02-…html` … `L07-…html` |
| Part B — ROS 2 on the AgileX LIMO | 8 Drive · 9 URDF/TF/RViz · 10 LiDAR & IMU · 11 Camera & Vision · 12 SLAM & AMCL · 13 Nav2 & Actions · 14 Real LIMO & final mission | `L08-…html` … `L14-…html` |
| Projects — Build Your Own Robot "Forge" | P1 Motors, power & compute · P2 Driver, URDF & sensors · P3 Simulation, 3D print & review | `projects.html`, `12-diy-…`, `13-diy-…`, `14-diy-…` |
| Extended reference notes | the original long-form lectures 02–11 | `02-…html` … `11-…html` |

Other files:

- `index.html` — course home page (roadmap, curriculum, per-student progress tracker)
- `prerequisites.html` — Mission Zero
- `syllabus.html`, `schedule.html`, `assignments.html`, `midterm.html`, `final.html`, `attendance.html` — course admin
- `lab.css` / `lab.js` — lecture layout, copy buttons, step ticks and progress bar
- `widgets.css` / `widgets.js` — interactive widgets: knowledge checks, flip cards, ordering/sorting games,
  code explorer, and simulators (pub/sub, service, action, interface builder, launch builder, go-to-goal,
  Twist/drift, quaternion, TF chain, LaserScan, HSV vision, particle filter, costmap planner)
- `book.css` / `projector.css` — course-admin styling and the high-legibility projector layer
- `annotate.js` — in-browser pen/whiteboard annotation tool
- `images/` — figures and screenshots; `images/figures/` holds the lecture diagrams
- `L10-limo-sensors.html`, `L11-limo-slam-nav2.html`, `L12-real-limo-mission.html` — redirects to the renamed lectures

## Running locally

This is a static site — no build step. Serve the folder with any static file server, e.g.:

```bash
python -m http.server 8000
```

then open `http://localhost:8000/index.html`.
