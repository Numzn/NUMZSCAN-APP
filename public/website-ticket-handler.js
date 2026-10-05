// Add this JavaScript to your program-pro-1.onrender.com website
// It will read the ticket ID from the URL and display it

(function() {
  // Get ticket ID from URL query parameter
  const urlParams = new URLSearchParams(window.location.search);
  const ticketId = urlParams.get('ticket');
  
  if (ticketId) {
    console.log('Ticket ID detected:', ticketId);
    
    // Option 1: Display ticket info on the page
    // You can customize this to match your website design
    function displayTicketInfo() {
      // Create or find a container for ticket info
      let ticketContainer = document.getElementById('ticket-info');
      
      if (!ticketContainer) {
        // Create container if it doesn't exist
        ticketContainer = document.createElement('div');
        ticketContainer.id = 'ticket-info';
        ticketContainer.style.cssText = `
          position: fixed;
          top: 20px;
          right: 20px;
          background: #fff;
          padding: 20px;
          border-radius: 10px;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
          z-index: 1000;
          max-width: 300px;
        `;
        document.body.appendChild(ticketContainer);
      }
      
      ticketContainer.innerHTML = `
        <h3 style="margin: 0 0 10px 0; color: #333;">🎫 Ticket Information</h3>
        <p style="margin: 0; font-family: monospace; font-size: 14px; color: #666;">
          ${ticketId}
        </p>
        <p style="margin: 10px 0 0 0; font-size: 12px; color: #999;">
          Valid event ticket
        </p>
      `;
    }
    
    // Option 2: Store ticket ID for later use
    window.ticketId = ticketId;
    
    // Option 3: Call a function with the ticket ID
    // if (typeof onTicketDetected === 'function') {
    //   onTicketDetected(ticketId);
    // }
    
    // Uncomment the line below to display ticket info automatically
    // displayTicketInfo();
    
    // Or call your own function to handle the ticket
    // handleTicket(ticketId);
  }
})();

// Example: Custom function to handle ticket
// function handleTicket(ticketId) {
//   // Your custom logic here
//   console.log('Processing ticket:', ticketId);
//   // Maybe fetch ticket details from an API
//   // Maybe show a modal
//   // Maybe redirect to a specific page
// }
