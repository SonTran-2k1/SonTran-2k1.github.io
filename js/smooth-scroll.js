document.addEventListener("DOMContentLoaded", function () {
    let scrollY = window.scrollY;
    let targetScrollY = scrollY;
    let isTicking = false;
    const ease = 0.08; // Độ mượt (càng nhỏ càng mượt)

    function updateScroll() {
        scrollY += (targetScrollY - scrollY) * ease;
        window.scrollTo(0, scrollY);
        if (Math.abs(targetScrollY - scrollY) > 0.5) {
            requestAnimationFrame(updateScroll);
        } else {
            isTicking = false;
        }
    }

    window.addEventListener("wheel", function (e) {
        e.preventDefault();
        targetScrollY += e.deltaY; // tăng giảm cuộn
        targetScrollY = Math.max(0, Math.min(targetScrollY, document.body.scrollHeight - window.innerHeight));

        if (!isTicking) {
            isTicking = true;
            requestAnimationFrame(updateScroll);
        }
    }, { passive: false });
});
