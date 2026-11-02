import test from "node:test";
import assert from "node:assert/strict";
import {normalizeHotelRoomNumber,roomServiceCheckoutAllowed} from "../lib/restaurant/hotel-room.mjs";

test("verified customer checkout with a valid room remains allowed",()=>{
 assert.equal(roomServiceCheckoutAllowed("120","customer-1"),true);
});
test("authorized POS can create an unlinked order for a valid room",()=>{
 assert.equal(roomServiceCheckoutAllowed("120",null,true),true);
});
test("anonymous customer cannot use staff-only room-service flow",()=>{
 assert.equal(roomServiceCheckoutAllowed("120",null),false);
 assert.equal(roomServiceCheckoutAllowed("120",""),false);
});
test("only literal true can authorize staff POS, not body-like strings",()=>{
 assert.equal(roomServiceCheckoutAllowed("120",null,"true"),false);
 assert.equal(roomServiceCheckoutAllowed("120",null,1),false);
});
test("invalid rooms are rejected even for authorized POS",()=>{
 for(const room of [""," ","!bad","x".repeat(25)])assert.equal(roomServiceCheckoutAllowed(room,null,true),false);
});
test("invalid rooms are rejected even for a customer",()=>{
 assert.equal(roomServiceCheckoutAllowed("!bad","customer-1"),false);
});
test("Arabic and Persian digits normalize to the same room number",()=>{
 assert.equal(normalizeHotelRoomNumber(" ١۲۰ "),"120");
 assert.equal(roomServiceCheckoutAllowed(normalizeHotelRoomNumber(" ١۲۰ "),null,true),true);
});
test("staff POS does not accept a malformed room identifier",()=>{
 assert.equal(roomServiceCheckoutAllowed(normalizeHotelRoomNumber({roomNumber:"120"}),null,true),false);
});
