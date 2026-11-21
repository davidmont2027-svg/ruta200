const tutorial=document.getElementById('tutorial-reservas');
const video=document.getElementById('tutorial-video');
tutorial?.addEventListener('toggle',()=>{if(!tutorial.open)video?.pause();});
